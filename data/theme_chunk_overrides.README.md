# Theme Chunk Overrides

File: `data/theme_chunk_overrides.json`

Purpose: force contiguous ayah ranges for "theme appearance" view per surah.

Format:

```json
{
  "2": [
    {
      "start_ayah": 1,
      "end_ayah": 5,
      "theme_id": 63,
      "label_bm": "Pembukaan hidayah",
      "label_en": "Opening guidance"
    }
  ]
}
```

Rules:

- Surah key must be a string number (`"1"`..`"114"`).
- `start_ayah` and `end_ayah` are required.
- `theme_id` is optional. If omitted, labels are used.
- Overlapping ranges are ignored after the first valid range.
- Any ayat not covered by manual ranges will still be chunked automatically.
