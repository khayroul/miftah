const { execSync } = require("child_process");

function testEdgeCli() {
  try {
    const audioContent = execSync('edge-tts --voice ar-SA-HamedNeural --text "مرحبا"', { encoding: 'buffer' });
    console.log("Got audio from CLI:", audioContent.length, "bytes");
  } catch (err) {
    console.error("CLI error:", err);
  }
}
testEdgeCli();
