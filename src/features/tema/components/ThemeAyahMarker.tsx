interface ThemeAyahMarkerProps {
  ayahNumber: number;
  className?: string;
}

const QURAN_IOS_AYAH_END_MARKER_SRC = "/mushaf/ayah-end-marker-quran-ios.png";

function toArabicIndicNumerals(value: number): string {
  return String(value).replaceAll(/\d/g, (digit) =>
    String.fromCharCode(0x0660 + Number.parseInt(digit, 10)),
  );
}

export function ThemeAyahMarker({
  ayahNumber,
  className = "",
}: ThemeAyahMarkerProps) {
  return (
    <span
      className={`relative inline-flex h-11 w-11 items-center justify-center text-[#004D40] dark:text-[#039F85] sm:h-12 sm:w-12 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
      lang="ar"
      dir="rtl"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-current"
        style={{
          WebkitMaskImage: `url(${QURAN_IOS_AYAH_END_MARKER_SRC})`,
          maskImage: `url(${QURAN_IOS_AYAH_END_MARKER_SRC})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
      <span
        aria-hidden="true"
        className="relative translate-y-[0.5px] text-[1.02rem] font-semibold leading-none sm:text-[1.14rem]"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </span>
  );
}
