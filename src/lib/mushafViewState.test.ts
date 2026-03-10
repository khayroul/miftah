import test from "node:test";
import assert from "node:assert/strict";
import { deriveMushafViewState } from "./mushafViewState";

test("thumbnail shows while full image loads", () => {
  const state = deriveMushafViewState({
    imageAvailable: true,
    thumbnailAvailable: true,
    fullImageFailed: false,
    thumbnailFailed: false,
    fullImageReady: false,
    wordsCount: 120,
  });

  assert.equal(state.canShowFullImage, true);
  assert.equal(state.canShowThumbnail, true);
  assert.equal(state.canShowAnyImage, true);
  assert.equal(state.canInteract, false);
});

test("interaction only active after full image is ready", () => {
  const state = deriveMushafViewState({
    imageAvailable: true,
    thumbnailAvailable: true,
    fullImageFailed: false,
    thumbnailFailed: false,
    fullImageReady: true,
    wordsCount: 80,
  });

  assert.equal(state.canInteract, true);
});

test("full image failure falls back to thumbnail only", () => {
  const state = deriveMushafViewState({
    imageAvailable: true,
    thumbnailAvailable: true,
    fullImageFailed: true,
    thumbnailFailed: false,
    fullImageReady: false,
    wordsCount: 80,
  });

  assert.equal(state.canShowFullImage, false);
  assert.equal(state.canShowThumbnail, true);
  assert.equal(state.canShowAnyImage, true);
  assert.equal(state.canInteract, false);
});

test("no images available produces non-render state", () => {
  const state = deriveMushafViewState({
    imageAvailable: false,
    thumbnailAvailable: false,
    fullImageFailed: false,
    thumbnailFailed: false,
    fullImageReady: false,
    wordsCount: 80,
  });

  assert.equal(state.canShowAnyImage, false);
  assert.equal(state.canInteract, false);
});
