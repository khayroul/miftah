-- Multi-user auth foundations for the web app.
-- Adds account-owned profile/state tables without touching legacy single-user
-- progress rows yet. Existing progress backfill happens in a later step.

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'ms',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_reading_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_page INT CHECK (last_page IS NULL OR (last_page >= 1 AND last_page <= 604)),
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.theme_chunk_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surah_id INT NOT NULL REFERENCES public.surahs(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL CHECK (chunk_index > 0),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, surah_id, chunk_index),
  CHECK (
    (status = 'started' AND completed_at IS NULL) OR
    (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_user_reading_state_last_read
  ON public.user_reading_state(last_read_at DESC);

CREATE INDEX idx_theme_chunk_progress_user_last_opened
  ON public.theme_chunk_progress(user_id, last_opened_at DESC);

CREATE INDEX idx_theme_chunk_progress_user_status
  ON public.theme_chunk_progress(user_id, status, surah_id);

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_user_reading_state_updated_at ON public.user_reading_state;
CREATE TRIGGER set_user_reading_state_updated_at
BEFORE UPDATE ON public.user_reading_state
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_theme_chunk_progress_updated_at ON public.theme_chunk_progress;
CREATE TRIGGER set_theme_chunk_progress_updated_at
BEFORE UPDATE ON public.theme_chunk_progress
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'name'
    )
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_reading_state (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reading_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_chunk_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own reading state"
  ON public.user_reading_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reading state"
  ON public.user_reading_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reading state"
  ON public.user_reading_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own theme chunk progress"
  ON public.theme_chunk_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own theme chunk progress"
  ON public.theme_chunk_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own theme chunk progress"
  ON public.theme_chunk_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
