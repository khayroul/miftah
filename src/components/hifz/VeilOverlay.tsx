import type { UnveilWord } from "@/lib/hifz/progressive-unveil";

interface VeilOverlayProps {
  words: UnveilWord[];
  revealedUpTo: number;
  imageWidth: number;
  imageHeight: number;
}

export function VeilOverlay({
  words,
  revealedUpTo,
  imageWidth,
  imageHeight,
}: VeilOverlayProps) {
  return (
    <svg
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <style>{`
          .veil-word { transition: opacity 200ms ease-out; }
          @media (prefers-reduced-motion: reduce) { .veil-word { transition: none; } }
        `}</style>
        <mask id="page-veil">
          {/* White rect = fully veiled area */}
          <rect x="0" y="0" width={imageWidth} height={imageHeight} fill="white" />
          {/* Black rects punch holes where words are revealed */}
          {words.map((word) => (
            <rect
              key={word.location}
              className="veil-word"
              x={word.hitbox.x - 2}
              y={word.hitbox.y - 2}
              width={word.hitbox.width + 4}
              height={word.hitbox.height + 4}
              fill="black"
              opacity={word.index <= revealedUpTo ? 1 : 0}
            />
          ))}
        </mask>
      </defs>
      {/* Parchment-coloured overlay, masked away where words are revealed */}
      <rect
        x="0"
        y="0"
        width={imageWidth}
        height={imageHeight}
        fill="#f5f0e8"
        mask="url(#page-veil)"
      />
    </svg>
  );
}
