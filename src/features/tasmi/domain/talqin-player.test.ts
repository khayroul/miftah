import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TalqinPlayer } from './talqin-player';

// Mock HTMLAudioElement
function mockAudio() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const audio = {
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = [...(listeners[event] ?? []), handler];
    }),
    removeEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter(h => h !== handler);
    }),
    _fireTimeUpdate: () => listeners['timeupdate']?.forEach(h => h()),
    _fireEnded: () => listeners['ended']?.forEach(h => h()),
  };
  // Ensure Audio exists on globalThis before spying (node env doesn't have it)
  if (!('Audio' in globalThis)) {
    (globalThis as unknown as Record<string, unknown>).Audio = function AudioStub() {};
  }
  vi.spyOn(globalThis, 'Audio').mockImplementation(function () { return audio; } as unknown as typeof Audio);
  return audio;
}

describe('TalqinPlayer.playRange', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('seeks to startSegment.startMs and stops at endSegment.endMs', async () => {
    const onEnd = vi.fn();
    const player = new TalqinPlayer({ wordsToPlay: 5, onPlaybackEnd: onEnd });
    player.loadFromRawData([{
      surah: 2, ayah: 1,
      segments: [
        [0, 1, 0, 500],
        [1, 2, 500, 1200],
        [2, 3, 1200, 1800],
        [3, 4, 1800, 2500],
      ],
    }]);

    const audio = mockAudio();
    await player.playRange(2, 1, 1, 3);

    expect(audio.currentTime).toBe(0.5); // 500ms
    expect(audio.play).toHaveBeenCalled();

    audio.currentTime = 2.5; // 2500ms
    audio._fireTimeUpdate();

    expect(onEnd).toHaveBeenCalled();
    expect(audio.pause).toHaveBeenCalled();
  });

  it('falls back to full ayah when no timestamp data', async () => {
    const onEnd = vi.fn();
    const player = new TalqinPlayer({ wordsToPlay: 5, onPlaybackEnd: onEnd });

    const audio = mockAudio();
    await player.playRange(2, 1, 0, 3);

    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalled();

    audio._fireEnded();
    expect(onEnd).toHaveBeenCalled();
  });
});

describe('TalqinPlayer.attachAudioElement (iOS gesture unlock)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('reuses the primed element instead of constructing Audio, across plays', async () => {
    const onEnd = vi.fn();
    const player = new TalqinPlayer({ wordsToPlay: 5, onPlaybackEnd: onEnd });

    const constructed = mockAudio(); // spies globalThis.Audio
    const primed = {
      currentTime: 0,
      src: '',
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    player.attachAudioElement(primed);

    await player.playRange(2, 1, 0, 3); // no timestamps -> full-ayah path
    await player.playRange(2, 1, 0, 3); // second play must also reuse it

    expect(primed.play).toHaveBeenCalledTimes(2);
    expect((primed as { src: string }).src).toContain('002001.mp3');
    // The gesture-unlocked element must be used — never a fresh Audio()
    expect(constructed.play).not.toHaveBeenCalled();
    expect(globalThis.Audio).not.toHaveBeenCalled();
  });

  it('stop() detaches listeners but keeps the shared element for reuse', async () => {
    const onEnd = vi.fn();
    const player = new TalqinPlayer({ wordsToPlay: 5, onPlaybackEnd: onEnd });
    mockAudio();

    const primed = {
      currentTime: 0,
      src: '',
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    player.attachAudioElement(primed);
    await player.playRange(2, 1, 0, 3);
    player.stop();

    expect(primed.pause).toHaveBeenCalled();
    expect(primed.removeEventListener).toHaveBeenCalled();

    // Still reusable after stop
    await player.playRange(2, 1, 0, 3);
    expect(primed.play).toHaveBeenCalledTimes(2);
  });
});
