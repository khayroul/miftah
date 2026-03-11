-- Create feedback table for beta users
CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_resolved BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own feedback
CREATE POLICY "Users can insert their own feedback"
    ON public.feedback
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Allow anonymous users to insert feedback too (for beta trial before login)
CREATE POLICY "Anon can insert feedback"
    ON public.feedback
    FOR INSERT
    TO anon
    WITH CHECK (user_id IS NULL);

-- Only service role/admins can read feedback
CREATE POLICY "System can read feedback"
    ON public.feedback
    FOR SELECT
    TO service_role
    USING (true);
