-- Add sequential ayah theme chunks (e.g. 2:1-5, 2:6-11)
-- Source: QUL ayah_themes resource

CREATE TABLE IF NOT EXISTS ayah_theme_chunks (
  id SERIAL PRIMARY KEY,
  source_chunk_id BIGINT UNIQUE,
  surah_id INT NOT NULL REFERENCES surahs(id),
  ayah_from INT NOT NULL,
  ayah_to INT NOT NULL,
  ayah_id_from INT REFERENCES ayat(id),
  ayah_id_to INT REFERENCES ayat(id),
  verse_key_from TEXT,
  verse_key_to TEXT,
  verses_count INT NOT NULL DEFAULT 0,
  theme TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  book_id INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (ayah_from > 0),
  CHECK (ayah_to >= ayah_from)
);

CREATE INDEX IF NOT EXISTS idx_ayah_theme_chunks_surah_range
  ON ayah_theme_chunks(surah_id, ayah_from, ayah_to);

CREATE INDEX IF NOT EXISTS idx_ayah_theme_chunks_ayah_from
  ON ayah_theme_chunks(ayah_id_from);

CREATE INDEX IF NOT EXISTS idx_ayah_theme_chunks_ayah_to
  ON ayah_theme_chunks(ayah_id_to);
