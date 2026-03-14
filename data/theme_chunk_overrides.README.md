# Theme Chunk Overrides

File: `data/theme_chunk_overrides.json`

Purpose: override theme-chunk metadata for the "theme appearance" view per surah.
This can be used to:

- force contiguous ayah ranges when runtime chunking falls back to auto mode
- replace chunk labels
- attach curated theme synopses

Format:

```json
{
  "2": [
    {
      "start_ayah": 1,
      "end_ayah": 5,
      "label_bm": "Pembukaan hidayah",
      "label_en": "Opening guidance",
      "synopsis_bm": "Pembukaan Surah al-Baqarah menegaskan Al-Quran sebagai kitab tanpa keraguan dan petunjuk bagi orang yang bertakwa."
    }
  ]
}
```

Rules:

- Surah key must be a string number (`"1"`..`"114"`).
- `start_ayah` and `end_ayah` are required.
- `theme_id`, `label_bm`, `label_en`, and `synopsis_bm` are optional.
- Overlapping ranges are ignored after the first valid range.
- If no runtime dataset chunk exists, any ayat not covered by manual ranges will still be chunked automatically.
- When a runtime dataset chunk does exist for the same ayah range, matching metadata in this file is merged onto that chunk.
