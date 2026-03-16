-- Returns the most recent review date for each page, derived from
-- review_log → study_progress (item_id) → ayat (ayah_id → page_number).
CREATE OR REPLACE FUNCTION public.get_last_review_per_page(p_user_id uuid)
RETURNS TABLE(page_number int, last_reviewed timestamptz)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.page_number,
    MAX(rl.reviewed_at) AS last_reviewed
  FROM public.review_log rl
  JOIN public.study_progress sp ON sp.id = rl.item_id
  JOIN public.ayat a ON a.id = sp.ayah_id
  WHERE rl.user_id = p_user_id
    AND rl.review_type = 'ayah'
  GROUP BY a.page_number;
$$;
