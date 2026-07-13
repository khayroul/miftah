import { createSupabaseServerClient } from "@/data/supabase/auth-server";

interface FeedbackInput {
  body: string;
  metadata: Record<string, unknown>;
  userId: string | null;
}

export async function insertFeedback(input: FeedbackInput): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("feedback").insert({
    user_id: input.userId,
    body: input.body,
    metadata: input.metadata,
  });

  if (error) {
    throw error;
  }
}
