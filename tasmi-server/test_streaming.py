import asyncio
import json
import threading
import unittest

from streaming import (
    BoundedInferenceCoordinator,
    InferenceBusy,
    OrderedAsyncTaskChain,
    PCM_SAMPLE_RATE,
    StreamTicketStore,
    audio_duration_ms,
    origin_allowed,
    parse_allowed_origins,
    parse_control_message,
    pcm16le_to_wav,
    should_cancel_partial_before_final,
    validate_wav_upload,
)


class StreamTicketStoreTests(unittest.TestCase):
    def test_ticket_is_single_use(self):
        clock = [10.0]
        store = StreamTicketStore(
            monotonic=lambda: clock[0],
            wall_time=lambda: 1_000.0,
        )

        issued = store.issue()

        self.assertTrue(store.consume(issued.value))
        self.assertFalse(store.consume(issued.value))
        self.assertEqual(issued.expires_at_epoch_ms, 1_060_000)

    def test_ticket_expires(self):
        clock = [10.0]
        store = StreamTicketStore(ttl_seconds=5, monotonic=lambda: clock[0])
        issued = store.issue()

        clock[0] = 15.0

        self.assertFalse(store.consume(issued.value))


class StreamProtocolTests(unittest.TestCase):
    def test_control_messages_are_strictly_reduced(self):
        payload = parse_control_message(
            json.dumps({"type": "speech_start", "utterance_id": 7, "ignored": True})
        )
        self.assertEqual(payload, {"type": "speech_start", "utterance_id": 7})

    def test_invalid_control_messages_are_rejected(self):
        self.assertIsNone(parse_control_message("not-json"))
        self.assertIsNone(parse_control_message(json.dumps({"type": "unknown"})))
        self.assertIsNone(
            parse_control_message(json.dumps({"type": "speech_end", "utterance_id": -1}))
        )
        self.assertIsNone(parse_control_message(json.dumps({"type": "auth", "ticket": "short"})))

    def test_origins_are_allowlisted(self):
        self.assertTrue(origin_allowed("https://miftah.app"))
        self.assertTrue(origin_allowed("https://miftah-six.vercel.app"))
        self.assertFalse(origin_allowed("http://localhost:3000"))
        self.assertFalse(origin_allowed("https://example.com"))
        self.assertFalse(origin_allowed("https://miftah-evil.vercel.app"))
        self.assertFalse(origin_allowed(None))

    def test_configured_origins_are_exact(self):
        allowed = parse_allowed_origins(
            "https://one.example, https://two.example, http://localhost:3000"
        )

        self.assertTrue(origin_allowed("https://one.example", allowed))
        self.assertFalse(origin_allowed("https://one.example.evil.test", allowed))
        self.assertTrue(origin_allowed("http://localhost:3000", allowed))


class PcmTests(unittest.TestCase):
    def test_pcm_is_wrapped_as_valid_wav(self):
        pcm = b"\x00\x00" * PCM_SAMPLE_RATE

        wav = pcm16le_to_wav(pcm)

        self.assertEqual(wav[:4], b"RIFF")
        self.assertEqual(wav[8:12], b"WAVE")
        self.assertEqual(audio_duration_ms(pcm), 1_000)
        self.assertEqual(validate_wav_upload(wav, max_audio_seconds=2), 1_000)

    def test_incomplete_pcm_sample_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "complete two-byte samples"):
            pcm16le_to_wav(b"\x00")

    def test_wav_contract_and_duration_are_enforced(self):
        pcm = b"\x00\x00" * PCM_SAMPLE_RATE
        wav = pcm16le_to_wav(pcm, sample_rate=8_000)

        with self.assertRaisesRegex(ValueError, "16 kHz"):
            validate_wav_upload(wav, max_audio_seconds=2)
        with self.assertRaisesRegex(ValueError, "duration"):
            validate_wav_upload(pcm16le_to_wav(pcm), max_audio_seconds=0.5)


class FinalPriorityPolicyTests(unittest.TestCase):
    def test_queued_identical_partial_is_requeued_at_final_priority(self):
        self.assertTrue(
            should_cancel_partial_before_final(
                task_pending=True,
                pending_pcm_size=1_024,
                final_pcm_size=1_024,
                inference_started=False,
            )
        )

    def test_active_identical_partial_is_reused(self):
        self.assertFalse(
            should_cancel_partial_before_final(
                task_pending=True,
                pending_pcm_size=1_024,
                final_pcm_size=1_024,
                inference_started=True,
            )
        )

    def test_stale_partial_is_cancelled_even_after_inference_starts(self):
        self.assertTrue(
            should_cancel_partial_before_final(
                task_pending=True,
                pending_pcm_size=1_024,
                final_pcm_size=2_048,
                inference_started=True,
            )
        )


class InferenceCoordinatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_request_does_not_release_native_worker(self):
        first_started = threading.Event()
        release_first = threading.Event()
        second_started = threading.Event()
        active = 0
        max_active = 0
        active_lock = threading.Lock()

        def runner(payload: bytes, _: bool) -> tuple[str, int]:
            nonlocal active, max_active
            with active_lock:
                active += 1
                max_active = max(max_active, active)
            try:
                if payload == b"first":
                    first_started.set()
                    release_first.wait(timeout=2)
                else:
                    second_started.set()
                return (payload.decode(), 1)
            finally:
                with active_lock:
                    active -= 1

        coordinator = BoundedInferenceCoordinator(
            runner, max_pending=2, result_timeout_seconds=2
        )
        coordinator.start()
        native_started = asyncio.Event()
        try:
            first = asyncio.create_task(
                coordinator.submit(
                    b"first",
                    False,
                    priority=0,
                    started_signal=native_started,
                )
            )
            self.assertTrue(await asyncio.to_thread(first_started.wait, 1))
            self.assertTrue(native_started.is_set())
            first.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await first

            second = asyncio.create_task(
                coordinator.submit(b"second", False, priority=0)
            )
            await asyncio.sleep(0.05)
            self.assertFalse(second_started.is_set())

            release_first.set()
            self.assertEqual(await second, ("second", 1))
            self.assertEqual(max_active, 1)
        finally:
            release_first.set()
            await coordinator.close()

    async def test_pending_queue_is_bounded(self):
        started = threading.Event()
        release = threading.Event()

        def runner(payload: bytes, _: bool) -> tuple[str, int]:
            started.set()
            release.wait(timeout=2)
            return (payload.decode(), 1)

        coordinator = BoundedInferenceCoordinator(
            runner, max_pending=1, result_timeout_seconds=2
        )
        coordinator.start()
        first = asyncio.create_task(coordinator.submit(b"one", False, priority=0))
        self.assertTrue(await asyncio.to_thread(started.wait, 1))
        queued = asyncio.create_task(coordinator.submit(b"two", False, priority=0))
        await asyncio.sleep(0)
        try:
            with self.assertRaises(InferenceBusy):
                await coordinator.submit(b"three", False, priority=0)
        finally:
            release.set()
            await first
            await queued
            await coordinator.close()

    async def test_cancelled_partial_is_skipped_before_priority_final(self):
        first_started = threading.Event()
        release_first = threading.Event()
        run_order: list[bytes] = []

        def runner(payload: bytes, _: bool) -> tuple[str, int]:
            run_order.append(payload)
            if payload == b"active":
                first_started.set()
                release_first.wait(timeout=2)
            return (payload.decode(), 1)

        coordinator = BoundedInferenceCoordinator(
            runner, max_pending=1, result_timeout_seconds=2
        )
        coordinator.start()
        active = asyncio.create_task(
            coordinator.submit(b"active", False, priority=0)
        )
        self.assertTrue(await asyncio.to_thread(first_started.wait, 1))
        partial_started = asyncio.Event()
        partial = asyncio.create_task(
            coordinator.submit(
                b"partial",
                False,
                priority=10,
                started_signal=partial_started,
            )
        )
        await asyncio.sleep(0)
        self.assertFalse(partial_started.is_set())
        partial.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await partial
        final = asyncio.create_task(
            coordinator.submit(b"final", False, priority=0)
        )
        try:
            release_first.set()
            await active
            self.assertEqual(await final, ("final", 1))
            self.assertEqual(run_order, [b"active", b"final"])
        finally:
            release_first.set()
            await coordinator.close()


class OrderedAsyncTaskChainTests(unittest.IsolatedAsyncioTestCase):
    async def test_tasks_run_in_append_order(self):
        release_first = asyncio.Event()
        second_started = asyncio.Event()
        order: list[str] = []
        chain = OrderedAsyncTaskChain()

        async def first_operation() -> None:
            order.append("first-start")
            await release_first.wait()
            order.append("first-finish")

        async def second_operation() -> None:
            second_started.set()
            order.append("second")

        first = chain.append(first_operation, name="ordered-first")
        second = chain.append(second_operation, name="ordered-second")
        await asyncio.sleep(0)

        self.assertFalse(second_started.is_set())
        release_first.set()
        await asyncio.gather(first, second)
        self.assertEqual(order, ["first-start", "first-finish", "second"])

    async def test_cancelling_waiter_does_not_run_its_operation(self):
        release_first = asyncio.Event()
        second_started = asyncio.Event()
        chain = OrderedAsyncTaskChain()

        async def first_operation() -> None:
            await release_first.wait()

        async def second_operation() -> None:
            second_started.set()

        first = chain.append(first_operation, name="ordered-first")
        second = chain.append(second_operation, name="ordered-second")
        await asyncio.sleep(0)
        second.cancel()

        with self.assertRaises(asyncio.CancelledError):
            await second
        release_first.set()
        await first
        self.assertFalse(second_started.is_set())

    async def test_previous_failure_does_not_block_next_task(self):
        order: list[str] = []
        chain = OrderedAsyncTaskChain()

        async def failing_operation() -> None:
            order.append("failed")
            raise RuntimeError("expected")

        async def following_operation() -> None:
            order.append("following")

        failed = chain.append(failing_operation, name="ordered-failed")
        following = chain.append(following_operation, name="ordered-following")
        results = await asyncio.gather(failed, following, return_exceptions=True)

        self.assertIsInstance(results[0], RuntimeError)
        self.assertIsNone(results[1])
        self.assertEqual(order, ["failed", "following"])


if __name__ == "__main__":
    unittest.main()
