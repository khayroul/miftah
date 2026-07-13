import test from "node:test";
import assert from "node:assert/strict";
import {
  SURAH_PAGE_MAP,
  getPageSurahId,
  getSurahPageCount,
} from "./surahPageMap";

test("SURAH_PAGE_MAP has exactly 114 surahs", () => {
  assert.equal(Object.keys(SURAH_PAGE_MAP).length, 114);
});

test("Al-Fatihah (surah 1) occupies page 1 only", () => {
  const fatihah = SURAH_PAGE_MAP[1];
  assert.ok(fatihah, "surah 1 must exist");
  assert.equal(fatihah.startPage, 1);
  assert.equal(fatihah.endPage, 1);
});

test("Al-Baqarah (surah 2) starts at page 2", () => {
  const baqarah = SURAH_PAGE_MAP[2];
  assert.ok(baqarah, "surah 2 must exist");
  assert.equal(baqarah.startPage, 2);
});

test("An-Nas (surah 114) ends at page 604", () => {
  const nas = SURAH_PAGE_MAP[114];
  assert.ok(nas, "surah 114 must exist");
  assert.equal(nas.endPage, 604);
});

test("page ranges are contiguous — no gaps between surahs", () => {
  // Adjacent surahs may share a page (new surah starts mid-page).
  // Valid: next.startPage === current.endPage (shared) or current.endPage + 1 (adjacent).
  // Invalid: next.startPage > current.endPage + 1 (gap).
  for (let surahId = 1; surahId <= 113; surahId++) {
    const current = SURAH_PAGE_MAP[surahId];
    const next = SURAH_PAGE_MAP[surahId + 1];
    assert.ok(current, `surah ${surahId} must exist`);
    assert.ok(next, `surah ${surahId + 1} must exist`);
    assert.ok(
      next.startPage <= current.endPage + 1,
      `gap detected: surah ${surahId + 1} startPage (${next.startPage}) > surah ${surahId} endPage (${current.endPage}) + 1`
    );
  }
});

test("getPageSurahId returns the surah for a given page", () => {
  // Returns the last (highest-numbered) surah that appears on that page.
  assert.equal(getPageSurahId(1), 1);
  assert.equal(getPageSurahId(2), 2);
  // Page 604 contains surahs 112, 113, 114 — returns the last one.
  assert.equal(getPageSurahId(604), 114);
});

test("getPageSurahId returns undefined for out-of-range pages", () => {
  assert.equal(getPageSurahId(0), undefined);
  assert.equal(getPageSurahId(605), undefined);
});

test("getSurahPageCount returns correct page count for Al-Fatihah", () => {
  assert.equal(getSurahPageCount(1), 1);
});

test("getSurahPageCount returns correct page count for Al-Baqarah", () => {
  const baqarah = SURAH_PAGE_MAP[2];
  assert.ok(baqarah);
  const expected = baqarah.endPage - baqarah.startPage + 1;
  assert.equal(getSurahPageCount(2), expected);
});

test("getSurahPageCount returns undefined for invalid surah", () => {
  assert.equal(getSurahPageCount(0), undefined);
  assert.equal(getSurahPageCount(115), undefined);
});

test("all surah entries have startPage <= endPage", () => {
  for (let surahId = 1; surahId <= 114; surahId++) {
    const entry = SURAH_PAGE_MAP[surahId];
    assert.ok(entry, `surah ${surahId} must exist`);
    assert.ok(
      entry.startPage <= entry.endPage,
      `surah ${surahId}: startPage ${entry.startPage} must be <= endPage ${entry.endPage}`
    );
  }
});
