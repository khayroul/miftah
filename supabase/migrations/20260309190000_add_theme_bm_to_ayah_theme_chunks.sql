-- Add cached Malay label for ayah theme chunks

ALTER TABLE ayah_theme_chunks
ADD COLUMN IF NOT EXISTS theme_bm TEXT;

