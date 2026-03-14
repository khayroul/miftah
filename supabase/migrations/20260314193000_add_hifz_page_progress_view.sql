CREATE OR REPLACE VIEW public.v_hifz_page_progress AS
WITH page_meta AS (
  SELECT
    a.page_number,
    MIN(a.juz_number) AS juz_number,
    COUNT(*) AS total_ayat
  FROM public.ayat a
  GROUP BY a.page_number
)
SELECT
  sp.user_id,
  pm.page_number,
  pm.juz_number,
  pm.total_ayat,
  COUNT(*) FILTER (
    WHERE sp.hifz_status IN ('sabak', 'sabqi', 'manzil')
  ) AS started_ayat,
  COUNT(*) FILTER (
    WHERE sp.hifz_status = 'sabak'
  ) AS sabak_ayat,
  COUNT(*) FILTER (
    WHERE sp.hifz_status = 'sabqi'
  ) AS sabqi_ayat,
  COUNT(*) FILTER (
    WHERE sp.hifz_status = 'manzil'
  ) AS manzil_ayat,
  COUNT(*) FILTER (
    WHERE sp.hifz_status IN ('sabqi', 'manzil')
      AND sp.due <= NOW()
  ) AS due_ayat,
  (
    COUNT(*) FILTER (
      WHERE sp.hifz_status IN ('sabak', 'sabqi', 'manzil')
    ) > 0
  ) AS is_started,
  (
    COUNT(*) FILTER (
      WHERE sp.hifz_status IN ('sabqi', 'manzil')
        AND sp.due <= NOW()
    ) > 0
  ) AS is_due,
  (
    COUNT(*) FILTER (
      WHERE sp.hifz_status = 'manzil'
    ) = pm.total_ayat
    AND pm.total_ayat > 0
  ) AS is_complete_manzil
FROM page_meta pm
JOIN public.ayat a
  ON a.page_number = pm.page_number
JOIN public.study_progress sp
  ON sp.ayah_id = a.id
GROUP BY
  sp.user_id,
  pm.page_number,
  pm.juz_number,
  pm.total_ayat;

COMMENT ON COLUMN public.profiles.daily_goal_type IS
  'Supported values: faham_words, read_pages, hifz_ayat (legacy), hifz_pages, theme_chunks.';
