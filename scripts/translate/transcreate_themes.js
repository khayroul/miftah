import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("No OPENAI_API_KEY found in env");
  process.exit(1);
}

const CHUNKS_FILE = path.join(__dirname, '../../data/seed/ayah_theme_chunks.json');
let chunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf8'));

// Filter out those we already processed (in case of resume) or all
// We only need to process chunks that haven't been processed yet.
// Wait, to distinguish, we can check if it's already translated. Actually, I will explicitly check a marker or just re-translate if it equals a literal old one? 
// Actually, earlier the script just updated indices 0 to ~220. We'll find chunks whose `theme_bm` needs updating by checking if they contain an old string.
// Wait, the user said they sound like literal English translations. Let's just track an original literal dictionary to skip? No, let's keep track using an empty marker or simple string matching. In this run, we'll just re-run all of them except the ones already processed.

const BATCH_SIZE = 25;
const CONCURRENCY = 5;

async function translateBatch(batch) {
  const prompt = `You are a professional Malay translator specializing in Islamic texts. 
I have a list of themes from the Quran in English. The previous literal translations sound awkward and rigid. 
I need you to "transcreate" these themes into beautiful, natural-sounding, contextually appropriate Bahasa Melayu.
The output should be short, punchy, and sound natural as a chapter heading or section topic in a Malaysian context. Focus on meaning rather than word-for-word literal translation.

Here are the items:
${batch.map((item, idx) => `[${idx}] EN: ${item.theme}`).join('\n')}

Output ONLY a raw valid JSON object (no markdown formatting, no comments) mapping the index to the new transcreated Malay string. Example: {"0": "Permohonan...", "1": "Al-Quran adalah..."}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error: ${txt}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content.trim();
  
  let cleanContent = content;
  if (cleanContent.startsWith('```')) {
    const lines = cleanContent.split('\n');
    cleanContent = lines.slice(1, lines.length - 1).join('\n');
  }

  try {
    return JSON.parse(cleanContent);
  } catch (e) {
    console.error("Failed to parse JSON:", cleanContent);
    throw e;
  }
}

async function run() {
  console.log(`Loaded ${chunks.length} chunks.`);

  // Find chunks that need translation. We assume chunks passed index 180 or so weren't translated yet cleanly in my memory.
  // Actually, wait, let's just translate from index 200 to the end. I terminated it at batch 200 to 219.
  const toTranslate = chunks.slice(200);

  const batches = [];
  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    batches.push({ offset: 200 + i, items: toTranslate.slice(i, i + BATCH_SIZE) });
  }

  let successCount = 200;

  async function processBatch(batchData) {
    let retries = 3;
    while (retries > 0) {
      try {
        console.log(`Translating offset ${batchData.offset}...`);
        const transcreatedDict = await translateBatch(batchData.items);
        for (let j = 0; j < batchData.items.length; j++) {
          if (transcreatedDict[j] !== undefined) {
             chunks[batchData.offset + j].theme_bm = transcreatedDict[j];
          }
        }
        successCount += batchData.items.length;
        fs.writeFileSync(CHUNKS_FILE, JSON.stringify(chunks, null, 2), 'utf8');
        return;
      } catch (err) {
        console.error(`Error offset ${batchData.offset}: ${err.message}`);
        retries--;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // Concurrency pool
  for (let idx = 0; idx < batches.length; idx += CONCURRENCY) {
    const currentBatches = batches.slice(idx, idx + CONCURRENCY);
    await Promise.all(currentBatches.map(processBatch));
    console.log(`Progress: ~${successCount}/${chunks.length}`);
  }

  fs.writeFileSync(CHUNKS_FILE, JSON.stringify(chunks, null, 2), 'utf8');
  console.log("Transcreation process finished.");
}

run();
