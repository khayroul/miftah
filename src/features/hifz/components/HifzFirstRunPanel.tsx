"use client";

export type HifzEntryPath = "fresh" | "import" | "test";

interface HifzFirstRunPanelProps {
  entryPath: HifzEntryPath;
  importPage: string;
  importing: boolean;
  isPending: boolean;
  loading: "memorize" | "review" | null;
  onEntryPathChange: (entryPath: HifzEntryPath) => void;
  onImport: () => void;
  onImportPageChange: (value: string) => void;
  onStartFresh: () => void;
  onTest: () => void;
  onTestPageChange: (value: string) => void;
  testPage: string;
}

function isValidPageNumber(pageValue: string): boolean {
  const page = Number.parseInt(pageValue, 10);
  return Number.isInteger(page) && page >= 1 && page <= 604;
}

export function HifzFirstRunPanel({
  entryPath,
  importPage,
  importing,
  isPending,
  loading,
  onEntryPathChange,
  onImport,
  onImportPageChange,
  onStartFresh,
  onTest,
  onTestPageChange,
  testPage,
}: HifzFirstRunPanelProps) {
  return (
    <div className="rounded-3xl border border-stone-200/80 bg-white/85 p-6 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/70 sm:p-8">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
          Langkah Pertama
        </p>
        <h3 className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
          Mulakan Hifz ikut keadaan sebenar anda
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          Pilih jalan yang paling dekat dengan keadaan anda sekarang. Kami akan bantu anda mula dengan lebih tenang, bukan kosong-kosong.
        </p>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <PathButton
          active={entryPath === "fresh"}
          activeClass="border-amber-400 bg-amber-50 text-amber-950 shadow-sm dark:border-amber-500/70 dark:bg-amber-900/25 dark:text-amber-50"
          description="Mula dari awal dengan sabak yang terus dibina untuk sesi pertama anda."
          inactiveClass="border-stone-200 bg-white/75 text-stone-700 hover:border-amber-200 hover:bg-amber-50/60 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-amber-500/40 dark:hover:bg-amber-900/15"
          label="Saya belum mula"
          onClick={() => onEntryPathChange("fresh")}
        />
        <PathButton
          active={entryPath === "import"}
          activeClass="border-indigo-400 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-500/70 dark:bg-indigo-900/25 dark:text-indigo-50"
          description="Rekod hafalan sedia ada supaya heatmap, manzil, dan halaman seterusnya terus selari."
          inactiveClass="border-stone-200 bg-white/75 text-stone-700 hover:border-indigo-200 hover:bg-indigo-50/60 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-900/15"
          label="Saya sudah hafal sampai halaman..."
          onClick={() => onEntryPathChange("import")}
        />
        <PathButton
          active={entryPath === "test"}
          activeClass="border-teal-400 bg-teal-50 text-teal-950 shadow-sm dark:border-teal-500/70 dark:bg-teal-900/25 dark:text-teal-50"
          description="Buka mod tasmi' pada halaman pilihan tanpa perlu tetapkan pelan penuh dahulu."
          inactiveClass="border-stone-200 bg-white/75 text-stone-700 hover:border-teal-200 hover:bg-teal-50/60 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-teal-500/40 dark:hover:bg-teal-900/15"
          label="Saya mahu uji hafalan sedia ada"
          onClick={() => onEntryPathChange("test")}
        />
      </div>

      {entryPath === "fresh" ? (
        <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-5 dark:border-amber-700/35 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Mulakan terus dari awal
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            Kami akan sediakan sabak pertama anda secara automatik. Selepas itu, anda boleh dengar, ikut mushaf, tutup, dan uji terus pada halaman yang sama.
          </p>
          <button
            type="button"
            disabled={loading !== null || isPending}
            onClick={onStartFresh}
            className="mt-4 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {loading === "memorize" ? "Menyediakan Sesi..." : "Mulakan Hafal dari Awal"}
          </button>
        </div>
      ) : null}

      {entryPath === "import" ? (
        <PageAction
          accent="indigo"
          buttonLabel={importing ? "Merekod Hafalan..." : "Rekod Hafalan Sedia Ada"}
          description="Selepas import, kami terus kemas kini heatmap, jumlah manzil, dan halaman sambungan supaya anda tak perlu keluar masuk semula."
          disabled={importing || !isValidPageNumber(importPage)}
          id="import-page"
          onClick={onImport}
          onPageChange={onImportPageChange}
          title="Rekod halaman terakhir yang sudah anda hafal"
          value={importPage}
        />
      ) : null}

      {entryPath === "test" ? (
        <PageAction
          accent="teal"
          buttonLabel="Buka Ujian Hafalan"
          description="Kami akan buka mushaf dalam mod tasmi' dengan petunjuk kata pembuka. Ini sesuai kalau anda mahu semak tahap semasa sebelum tetapkan pelan."
          disabled={!isValidPageNumber(testPage) || isPending}
          id="test-page"
          onClick={onTest}
          onPageChange={onTestPageChange}
          title="Uji halaman tertentu dahulu"
          value={testPage}
        />
      ) : null}
    </div>
  );
}

function PathButton(props: {
  active: boolean;
  activeClass: string;
  description: string;
  inactiveClass: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-2xl border px-4 py-4 text-left transition ${
        props.active
          ? props.activeClass
          : props.inactiveClass
      }`}
    >
      <p className="text-sm font-semibold">{props.label}</p>
      <p className="mt-1 text-sm leading-relaxed opacity-80">{props.description}</p>
    </button>
  );
}

function PageAction(props: {
  accent: "indigo" | "teal";
  buttonLabel: string;
  description: string;
  disabled: boolean;
  id: string;
  onClick: () => void;
  onPageChange: (value: string) => void;
  title: string;
  value: string;
}) {
  const styles = props.accent === "indigo"
    ? "border-indigo-200/80 bg-indigo-50/80 dark:border-indigo-700/35 dark:bg-indigo-900/20"
    : "border-teal-200/80 bg-teal-50/80 dark:border-teal-700/35 dark:bg-teal-900/20";
  const titleStyles = props.accent === "indigo"
    ? "text-indigo-950 dark:text-indigo-100"
    : "text-teal-950 dark:text-teal-100";
  const descriptionStyles = props.accent === "indigo"
    ? "text-indigo-900/80 dark:text-indigo-100/80"
    : "text-teal-900/80 dark:text-teal-100/80";
  const labelStyles = props.accent === "indigo"
    ? "text-indigo-900 dark:text-indigo-100"
    : "text-teal-900 dark:text-teal-100";
  const suffixStyles = props.accent === "indigo"
    ? "text-indigo-800/70 dark:text-indigo-200/70"
    : "text-teal-800/70 dark:text-teal-200/70";
  const inputStyles = props.accent === "indigo"
    ? "border-indigo-200 focus:border-indigo-500 focus:ring-indigo-500 dark:border-indigo-700"
    : "border-teal-200 focus:border-teal-500 focus:ring-teal-500 dark:border-teal-700";
  const buttonStyles = props.accent === "indigo"
    ? "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
    : "bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500";
  return (
    <div className={`mt-6 rounded-2xl border p-5 ${styles}`}>
      <p className={`text-sm font-semibold ${titleStyles}`}>{props.title}</p>
      <p className={`mt-2 text-sm leading-relaxed ${descriptionStyles}`}>{props.description}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <label htmlFor={props.id} className={`text-sm font-medium ${labelStyles}`}>Halaman:</label>
          <input
            id={props.id}
            type="number"
            min={1}
            max={604}
            value={props.value}
            onChange={(event) => props.onPageChange(event.target.value)}
            placeholder="cth. 17"
            className={`w-28 rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500 ${inputStyles}`}
          />
          <span className={`text-sm ${suffixStyles}`}>/ 604</span>
        </div>
        <button
          type="button"
          disabled={props.disabled}
          onClick={props.onClick}
          className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${buttonStyles}`}
        >
          {props.buttonLabel}
        </button>
      </div>
    </div>
  );
}
