const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in env. Did you forget to load .env.local?");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const CHUNKS_FILE = path.join(__dirname, '../../data/seed/ayah_theme_chunks.json');

async function upload() {
  const chunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf8'));
  console.log(`Loaded ${chunks.length} chunks from JSON.`);

  const BATCH_SIZE = 100;
  let successCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    
    // We only need id and theme_bm for upset/update
    // Supabase allows bulk upsert if we provide primary key
    const updates = batch.map(c => ({
      id: c.id,
      surah_id: c.surah_id,
      ayah_from: c.ayah_from,
      ayah_to: c.ayah_to,
      theme: c.theme,
      theme_bm: c.theme_bm
    }));

    const { data, error } = await supabase
      .from('ayah_theme_chunks')
      .upsert(updates, { onConflict: 'id' });

    if (error) {
      console.error(`Error uploading batch ${i}:`, error.message);
      process.exit(1);
    }
    successCount += batch.length;
    console.log(`Uploaded ${successCount}/${chunks.length}...`);
  }
  console.log("Upload complete.");
}

upload();
