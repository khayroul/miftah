const STORAGE_KEY = "miftah:hifz:difficult-ayahs";

function loadSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(set: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function getDifficultAyahs(): Set<string> {
  return loadSet();
}

export function isDifficultAyah(ayahKey: string): boolean {
  return loadSet().has(ayahKey);
}

/** Toggle a difficult ayah marker. Returns `true` if now marked difficult, `false` if removed. */
export function toggleDifficultAyah(ayahKey: string): boolean {
  const set = loadSet();
  if (set.has(ayahKey)) {
    set.delete(ayahKey);
    saveSet(set);
    return false;
  }
  set.add(ayahKey);
  saveSet(set);
  return true;
}

export function getDifficultAyahCount(): number {
  return loadSet().size;
}
