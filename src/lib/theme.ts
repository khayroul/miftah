"use client";

export type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "miftah:theme";
const listeners = new Set<() => void>();
const defaultTheme: AppTheme = "light";

let initialized = false;
let currentTheme: AppTheme = defaultTheme;

function normalizeTheme(value: string | null): AppTheme | null {
  if (value === "light" || value === "dark") {
    return value;
  }
  return null;
}

function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  const fromStorage = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  if (fromStorage) {
    return fromStorage;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initializeTheme(): void {
  if (initialized || typeof window === "undefined") {
    return;
  }

  initialized = true;
  const resolvedTheme = resolveInitialTheme();
  const didChange = currentTheme !== resolvedTheme;
  currentTheme = resolvedTheme;
  applyTheme(currentTheme);

  if (didChange) {
    notifyListeners();
  }
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadTheme(): AppTheme {
  return currentTheme;
}

export function saveTheme(nextTheme: AppTheme): void {
  const normalized = nextTheme === "dark" ? "dark" : "light";
  initialized = true;
  currentTheme = normalized;
  applyTheme(currentTheme);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  }

  notifyListeners();
}

export function toggleTheme(): void {
  saveTheme(currentTheme === "dark" ? "light" : "dark");
}

export { defaultTheme };
