import { getTranslations } from "next-intl/server";
import { OfflineAwareLink } from "@/components/OfflineAwareLink";
import { ModeNavigator } from "@/features/read";
import { getReadJumpTargets } from "@/lib/readNavigation";
import styles from "./guide.module.css";

type ModeKey = "read" | "learn" | "theme" | "hifz";

interface GuideMode {
  action: string;
  description: string;
  href: string;
  key: ModeKey;
  outcome: string;
  title: string;
}

function ModeIcon({ mode }: { mode: ModeKey }) {
  const path =
    mode === "read"
      ? "M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"
      : mode === "learn"
        ? "M9.5 4.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 0 0-7h-5Zm0 8a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 0 0-7h-5Z"
        : mode === "theme"
          ? "M6 5h12M6 12h12M6 19h12M3 5h.01M3 12h.01M3 19h.01"
          : "M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-4";

  return (
    <svg viewBox="0 0 24 24" className={styles.modeIconSvg} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.arrowIcon} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GuidePath({ modes }: { modes: GuideMode[] }) {
  return (
    <ol className={styles.path}>
      {modes.map((mode) => (
        <li key={mode.key} className={`${styles.step} ${styles[mode.key]}`}>
          <OfflineAwareLink href={mode.href} prefetch={false} className={styles.modeLink}>
            <span className={styles.modeIcon}><ModeIcon mode={mode.key} /></span>
            <span className={styles.modeCopy}>
              <span className={styles.modeTitle}>{mode.title}</span>
              <span className={styles.modeOutcome}>{mode.outcome}</span>
              <span className={styles.modeDescription}>{mode.description}</span>
            </span>
            <span className={styles.modeAction}>{mode.action}<ArrowIcon /></span>
          </OfflineAwareLink>
        </li>
      ))}
    </ol>
  );
}

export default async function GuidePage() {
  const [t, jumpTargets] = await Promise.all([
    getTranslations("guide"),
    getReadJumpTargets(),
  ]);
  const modes: GuideMode[] = [
    { key: "read", href: "/read/1", title: t("modes.read.title"), description: t("modes.read.description"), outcome: t("modes.read.outcome"), action: t("modes.read.action") },
    { key: "learn", href: "/faham", title: t("modes.learn.title"), description: t("modes.learn.description"), outcome: t("modes.learn.outcome"), action: t("modes.learn.action") },
    { key: "theme", href: "/read/surah/1/themes", title: t("modes.theme.title"), description: t("modes.theme.description"), outcome: t("modes.theme.outcome"), action: t("modes.theme.action") },
    { key: "hifz", href: "/hifz", title: t("modes.hifz.title"), description: t("modes.hifz.description"), outcome: t("modes.hifz.outcome"), action: t("modes.hifz.action") },
  ];

  return (
    <div className={styles.shell}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <main className={styles.main}>
        <ModeNavigator activeMode={null} surahTargets={jumpTargets.surahs} showUtilities />

        <section className={styles.hero}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.description}>{t("description")}</p>
          <p className={styles.permission}>{t("startAnywhere")}</p>
        </section>

        <section className={styles.journey} aria-labelledby="guide-connection-title">
          <div className={styles.journeyIntro}>
            <h2 id="guide-connection-title">{t("connectionTitle")}</h2>
            <p>{t("connectionDescription")}</p>
          </div>
          <GuidePath modes={modes} />
        </section>

        <aside className={styles.recommendation}>
          <div className={styles.recommendationCopy}>
            <h2>{t("unsureTitle")}</h2>
            <p>{t("unsureDescription")}</p>
          </div>
          <div className={styles.recommendationActions}>
            <OfflineAwareLink href="/faham" prefetch={false} className={styles.primaryAction}>{t("tryLearn")}</OfflineAwareLink>
            <OfflineAwareLink href="/" prefetch={false} className={styles.secondaryAction}>{t("backHome")}</OfflineAwareLink>
          </div>
        </aside>
      </main>
    </div>
  );
}
