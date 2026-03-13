interface ThemeAyahMarkerProps {
  ayahNumber: number;
  className?: string;
}

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
    <div
      className={`relative flex h-10 w-10 items-center justify-center text-stone-600 dark:text-stone-300 ${className}`.trim()}
      aria-label={`Ayat ${ayahNumber}`}
      title={`Ayat ${ayahNumber}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-[2.3rem] leading-none"
      >
        ۝
      </span>
      <span
        aria-hidden="true"
        lang="ar"
        dir="rtl"
        className="relative z-10 font-arabic text-[0.72rem] font-semibold leading-none"
      >
        {toArabicIndicNumerals(ayahNumber)}
      </span>
    </div>
  );
}
