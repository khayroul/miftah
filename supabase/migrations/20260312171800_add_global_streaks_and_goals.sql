-- Global activity streaks and daily goals
CREATE TABLE public.user_activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  activity_type TEXT NOT NULL, -- 'read', 'faham', 'hifz', 'theme'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, activity_date, activity_type)
);

CREATE TABLE public.user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_activity_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add daily goal to profiles
ALTER TABLE public.profiles
ADD COLUMN daily_goal_count INT DEFAULT 10,
ADD COLUMN daily_goal_type TEXT DEFAULT 'faham_words'; -- 'faham_words', 'read_pages', 'hifz_ayat'

-- Index for streak calculation
CREATE INDEX idx_user_activity_log_user_date ON public.user_activity_log(user_id, activity_date);

-- RLS
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity log" ON public.user_activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity log" ON public.user_activity_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own streaks" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);

-- Function to update streak on activity
CREATE OR REPLACE FUNCTION public.update_user_streak()
RETURNS TRIGGER AS $$
DECLARE
    last_date DATE;
    curr_streak INT;
BEGIN
    SELECT last_activity_date, current_streak INTO last_date, curr_streak
    FROM public.user_streaks
    WHERE user_id = NEW.user_id;

    IF NOT FOUND THEN
        INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_activity_date)
        VALUES (NEW.user_id, 1, 1, NEW.activity_date);
    ELSE
        IF last_date = NEW.activity_date THEN
            -- Already active today, do nothing
            RETURN NEW;
        ELSIF last_date = NEW.activity_date - INTERVAL '1 day' THEN
            -- Consecutive day
            UPDATE public.user_streaks
            SET current_streak = current_streak + 1,
                longest_streak = GREATEST(longest_streak, current_streak + 1),
                last_activity_date = NEW.activity_date,
                updated_at = NOW()
            WHERE user_id = NEW.user_id;
        ELSE
            -- Streak broken
            UPDATE public.user_streaks
            SET current_streak = 1,
                last_activity_date = NEW.activity_date,
                updated_at = NOW()
            WHERE user_id = NEW.user_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_update_user_streak
AFTER INSERT ON public.user_activity_log
FOR EACH ROW
EXECUTE FUNCTION public.update_user_streak();
