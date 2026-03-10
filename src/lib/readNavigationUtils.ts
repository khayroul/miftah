export interface JumpMarker {
  id: number;
  page: number;
}

export function parseBoundedIntegerInput(
  rawValue: string,
  min: number,
  max: number,
): number | null {
  const normalized = rawValue.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

export function findMarkerForPage<T extends JumpMarker>(
  markers: T[],
  page: number,
): T | null {
  if (markers.length === 0) {
    return null;
  }

  let current = markers[0];
  for (const marker of markers) {
    if (marker.page > page) {
      break;
    }
    current = marker;
  }

  return current;
}

export function getMarkerPageById<T extends JumpMarker>(
  markers: T[],
  id: number,
): number | null {
  const found = markers.find((marker) => marker.id === id);
  return found?.page ?? null;
}
