const fetch = require('node-fetch');

async function testGoogleTTS(text, lang) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    console.log(`Status for ${lang}: ${res.status}`);
    const buffer = await res.buffer();
    console.log(`Length for ${lang}: ${buffer.length} bytes`);
  } catch (err) {
    console.error(`Error for ${lang}:`, err);
  }
}

testGoogleTTS('Selamat pagi', 'ms');
