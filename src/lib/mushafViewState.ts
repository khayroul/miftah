export interface MushafViewStateInput {
  imageAvailable: boolean;
  thumbnailAvailable: boolean;
  fullImageFailed: boolean;
  thumbnailFailed: boolean;
  fullImageReady: boolean;
  wordsCount: number;
}

export interface MushafViewState {
  canShowFullImage: boolean;
  canShowThumbnail: boolean;
  canShowAnyImage: boolean;
  canInteract: boolean;
}

export function deriveMushafViewState(input: MushafViewStateInput): MushafViewState {
  const canShowFullImage = input.imageAvailable && !input.fullImageFailed;
  const canShowThumbnail = input.thumbnailAvailable && !input.thumbnailFailed;
  const canShowAnyImage = canShowFullImage || canShowThumbnail;
  const canInteract = canShowFullImage && input.fullImageReady && input.wordsCount > 0;

  return {
    canShowFullImage,
    canShowThumbnail,
    canShowAnyImage,
    canInteract,
  };
}
