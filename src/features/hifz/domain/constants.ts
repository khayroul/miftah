export const TOTAL_QURAN_PAGES = 604;

export const JUZ_BOUNDARY_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
] as const;

export const JUZ_PAGE_COUNTS: Record<number, number> = Object.fromEntries(
  JUZ_BOUNDARY_PAGES.map((startPage, index) => {
    const nextStartPage = JUZ_BOUNDARY_PAGES[index + 1] ?? (TOTAL_QURAN_PAGES + 1);
    return [index + 1, nextStartPage - startPage];
  }),
);

export function pageToJuz(page: number): number {
  for (let i = JUZ_BOUNDARY_PAGES.length - 1; i >= 0; i--) {
    if (page >= JUZ_BOUNDARY_PAGES[i]) return i + 1;
  }
  return 1;
}
