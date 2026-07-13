import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/read/personalization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST rejects more ayah ids than a Quran page can contain", async () => {
  const response = await POST(
    jsonRequest({ ayahIds: Array.from({ length: 51 }, (_, index) => index + 1) }),
  );
  assert.equal(response.status, 400);
});

test("POST rejects non-positive ids and unknown payload fields", async () => {
  const invalidIdResponse = await POST(jsonRequest({ ayahIds: [0] }));
  assert.equal(invalidIdResponse.status, 400);

  const unknownFieldResponse = await POST(
    jsonRequest({ ayahIds: [1], page: 1 }),
  );
  assert.equal(unknownFieldResponse.status, 400);
});

test("POST rejects malformed JSON before auth or database access", async () => {
  const response = await POST(
    new Request("http://localhost/api/read/personalization", {
      method: "POST",
      body: "{",
    }),
  );
  assert.equal(response.status, 400);
});
