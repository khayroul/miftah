export function getQuranWordAudioUrl(
  surah: number,
  ayah: number,
  wordPosition: number,
): string {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  const w = String(wordPosition).padStart(3, "0");
  return `https://audio.qurancdn.com/wbw/${s}_${a}_${w}.mp3`;
}
