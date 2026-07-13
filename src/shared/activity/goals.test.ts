import assert from "node:assert/strict";
import test from "node:test";

test("recommendHifzPageGoalFromAyahGoal converts ayah goals into page goals", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  const { recommendHifzPageGoalFromAyahGoal } = await import("./goals");

  assert.equal(recommendHifzPageGoalFromAyahGoal(0), 1);
  assert.equal(recommendHifzPageGoalFromAyahGoal(1), 1);
  assert.equal(recommendHifzPageGoalFromAyahGoal(10), 1);
  assert.equal(recommendHifzPageGoalFromAyahGoal(20), 2);
});
