---
name: "Miftah (مفتاح)"
description: "A calm Quran study system for understanding, recall, and consistent review."
colors:
  warm-paper: "#f6f3eb"
  warm-ink: "#1c1917"
  warm-surface-translucent: "rgba(255, 253, 248, 0.9)"
  warm-surface: "#fffdf8"
  warm-surface-muted: "#eeebe2"
  warm-surface-strong: "#e4dfd3"
  warm-border-subtle: "rgba(87, 83, 78, 0.18)"
  warm-border-strong: "rgba(87, 83, 78, 0.32)"
  warm-muted: "#57534e"
  muted-teal: "#0f766e"
  deep-teal: "#115e59"
  soft-teal: "#ccfbf1"
  restrained-amber: "#b45309"
  mode-learn-ink: "#92400e"
  mode-learn-soft: "#fef3c7"
  mode-theme-ink: "#4338ca"
  mode-theme-soft: "#e0e7ff"
  mode-hifz-ink: "#334155"
  mode-hifz-soft: "#e2e8f0"
  success-green: "#047857"
  warning-ochre: "#a16207"
  danger-rose: "#be123c"
  focus-teal: "rgba(13, 148, 136, 0.42)"
  night-canvas: "#061224"
  night-ink: "#e5e7eb"
  night-surface-translucent: "rgba(15, 23, 42, 0.9)"
  night-surface: "#0f1b2e"
  night-surface-muted: "#152238"
  night-surface-strong: "#203049"
  night-border-subtle: "rgba(148, 163, 184, 0.2)"
  night-border-strong: "rgba(148, 163, 184, 0.36)"
  night-muted: "#cbd5e1"
  luminous-teal: "#5eead4"
  luminous-teal-strong: "#99f6e4"
  night-teal-soft: "rgba(13, 148, 136, 0.2)"
  luminous-amber: "#fbbf24"
  night-success: "#6ee7b7"
  night-warning: "#fde68a"
  night-danger: "#fda4af"
  night-focus: "rgba(45, 212, 191, 0.5)"
  recall-navy: "#10213a"
  recall-navy-deep: "#081426"
typography:
  display:
    fontFamily: "SF Pro Text, SF Pro Display, Segoe UI, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "SF Pro Text, SF Pro Display, Segoe UI, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "SF Pro Text, SF Pro Display, Segoe UI, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "SF Pro Text, SF Pro Display, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "SF Pro Text, SF Pro Display, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  caption:
    fontFamily: "SF Pro Text, SF Pro Display, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  quran:
    fontFamily: "var(--font-quran-arabic), serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "normal"
  quran-surah-name:
    fontFamily: "Surah_names, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  quran-basmala:
    fontFamily: "Qcf2_bsml, serif"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  mono:
    fontFamily: "SF Mono, Cascadia Code, JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  nav: "26px"
  container: "32px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.muted-teal}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.deep-teal}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-accent:
    backgroundColor: "{colors.restrained-amber}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.warm-surface-muted}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  input-standard:
    backgroundColor: "{colors.warm-surface}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  card-layered:
    backgroundColor: "{colors.warm-surface-translucent}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "24px"
  navigation-global:
    backgroundColor: "{colors.warm-surface-translucent}"
    textColor: "{colors.warm-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.nav}"
    padding: "4px"
    height: "52px"
  chip-selected:
    backgroundColor: "{colors.warm-surface}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
  recall-chamber:
    backgroundColor: "{colors.recall-navy}"
    textColor: "{colors.night-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "48px 24px"
---

# Design System: Miftah (مفتاح)

## Overview

**Creative North Star: "The Illuminated Mushaf Desk"**

Miftah should feel like focused Quran study at a carefully prepared desk: warm paper, quiet light, clear instruments, and no visual noise competing with the text. Its atmosphere is calm, grounded, and contemporary rather than ornate. The interface guides without performing; meaning, recall, and review remain easy to understand in Bahasa Malaysia and equally complete in English.

The system moves between two complementary environments. Warm paper and translucent ivory surfaces support orientation, explanation, and planning. Deep navy surfaces create a private chamber for deliberate recall. Muted teal marks constructive action and progress, while restrained amber identifies new work or a moment requiring attention. The Quran is never styling material: QCF V2 page-specific glyphs are the visual authority, and surrounding UI must defer to them.

**Key Characteristics:**

- Warm paper and deep navy canvases with semantic light and dark counterparts.
- Layered, gently translucent surfaces with borders doing most of the structural work.
- Muted teal for constructive action; amber used selectively for new work and attention.
- Rounded, generous controls with a 44px minimum touch target.
- Clear sentence-case guidance and compact, stable navigation.
- QCF V2 Quran rendering preserved without approximate font substitution.

## Colors

The palette combines the material warmth of paper with the concentration of a navy study chamber; accents are purposeful and never rainbow-like.

### Primary

- **Muted Teal:** The default constructive action, link, progress, and listening color on warm surfaces.
- **Deep Teal:** Stronger explanatory emphasis and the hover state for primary actions in light mode.
- **Luminous Teal:** The dark-canvas counterpart, bright enough for clear action without becoming neon.
- **Soft Teal:** Selection, gentle feedback, and low-emphasis accent fills.

### Secondary

- **Restrained Amber:** New work, selected light-theme warmth, and attention states that should not compete with primary review.
- **Luminous Amber:** The legible dark-theme counterpart for the same semantic role.

### Tertiary

- **Success Green:** Successful completion and constructive confirmation.
- **Warning Ochre:** Caution that is distinct from new-work amber.
- **Danger Rose:** Errors and destructive or failed states only.

### Neutral

- **Warm Paper:** The light canvas and default reading-adjacent background.
- **Warm Ink:** Primary light-theme text.
- **Warm Surfaces:** Translucent, solid, muted, and strong layers create hierarchy without abandoning the paper world.
- **Warm Borders:** Subtle borders separate normal containers; strong borders define inputs and clearer boundaries.
- **Night Canvas:** The dark-theme foundation and the broader recall atmosphere.
- **Night Ink:** Primary text on dark canvases.
- **Night Surfaces:** Navy translucent, solid, muted, and strong layers mirror the light semantic hierarchy.
- **Night Borders:** Cool slate boundaries preserve separation without creating bright boxes.
- **Recall Navy:** The dedicated covered-passage surface; it may deepen further in dark mode.

### Named Rules

**The Purposeful Accent Rule.** Teal communicates constructive action and progress; amber communicates new work or attention. Do not use both merely to decorate the same hierarchy.

**The Mode Tone Rule.** Read stays paper-neutral, Faham uses amber for newly introduced words and teal for due review, Theme uses indigo for meaning and interpretation, and Hifz uses slate/navy for deliberate recall. These tones identify mode context; they do not replace semantic success, warning, or error colors.

**The Semantic Mirror Rule.** New surfaces must use the established semantic light and dark roles, never an unrelated palette that only works in one theme.

**The Quran Authority Rule.** UI color may frame Quran content, but must never recolor, approximate, or visually overpower the QCF V2 rendering.

## Typography

**Display Font:** SF Pro Text / SF Pro Display (with Segoe UI and system UI fallbacks)

**Body Font:** SF Pro Text (with Segoe UI and system UI fallbacks)

**Label/Mono Font:** SF Pro Text for labels; SF Mono (with Cascadia Code, JetBrains Mono, and monospace fallbacks) for technical values

**Quran Font:** Page-specific QCF V2 via the established `--font-quran-arabic` loading path

**Character:** The Latin interface is quiet, legible, and moderately weighted: hierarchy comes from scale and spacing more than typographic novelty. Quran Arabic is a separate authoritative system whose page-specific glyph mapping must remain intact.

### Hierarchy

- **Display** (medium, 3rem, 1.1): Rare hero statements and major first-run framing; use tighter tracking and keep lines short.
- **Headline** (semibold, 2.25rem, 1.15): Page-level orientation and prominent outcomes.
- **Title** (semibold, 1.5rem, 1.25): Card and section titles that anchor a task.
- **Body** (regular, 1rem, 1.625): Instructions, translations, and explanatory content; prefer readable measures around 65–75 characters.
- **Label** (semibold, 0.875rem, 1.25): Buttons, fields, navigation, compact metadata, and values.
- **Caption** (medium, 0.75rem, 1.4): Secondary metadata and short provenance labels; never primary instructions or word meanings.
- **Quran** (regular, 2.25rem base, 1.9): Ayah-level QCF V2 rendering; larger responsive sizes are valid when the glyph layout and reading context allow them.
- **Quran Surah Name / Basmala:** Use the established `Surah_names` and `Qcf2_bsml` assets only for their intended ornamental glyph ranges.

### Named Rules

**The Sentence-Case Guidance Rule.** Practice instructions and action labels use normal sentence case. Uppercase is reserved for genuinely compact metadata, never as a decorative kicker in a recall flow.

**The Two-Script Rule.** Interface type may follow the system stack, but Quran Arabic must always use the page-correct QCF V2 asset and its established renderer.

## Layout

The product uses centered single-column workspaces with generous breathing room: broad dashboards top out around the 6xl–7xl container range, while reading and focused work often narrow to 3xl–5xl. Default page gutters are 16px on mobile and 24px from small screens upward. Vertical page rhythm commonly advances in 24–32px groups, while component internals use the 8px, 12px, 16px, 20px, and 24px spacing steps.

Navigation stays at the top of the workspace and retains the same geometry across Read, Faham, Tema, and Hifz. On a 390px viewport, home plus four modes and utility controls must remain available without horizontal scrolling. Ordinary interactive controls have a minimum 44px target; a visually smaller icon still sits inside that target.

Cards may form responsive grids, but task order remains legible when collapsed: due review first, new work second, and free practice secondary. Reading mode is the spatial exception: it removes nonessential chrome so the Mushaf can remain primary.

**The Continuous-Session Rule.** Ayah and Mushaf are two views of one practice session. Layout changes may not imply a restart, duplicate progress, or move the user into a second navigation system.

## Elevation & Depth

Miftah uses a hybrid of tonal layering, translucent surfaces, borders, restrained ambient glow, and a small shadow vocabulary. Depth belongs to containers and major overlays, not every nested card. Radial teal and amber glows soften large canvases; they are atmosphere, never content-bearing decoration.

### Shadow Vocabulary

- **Soft Surface** (`0 18px 55px -38px rgba(41, 37, 36, 0.45)`): Ambient lift for shared translucent and solid surfaces in light mode.
- **Raised Surface** (`0 24px 70px -42px rgba(28, 25, 23, 0.55)`): Major containers, overlays, or moments that genuinely sit above the page.
- **Soft Night Surface** (`0 18px 55px -38px rgba(0, 0, 0, 0.78)`): Dark-theme counterpart to soft surface elevation.
- **Raised Night Surface** (`0 24px 70px -42px rgba(0, 0, 0, 0.88)`): Dark-theme counterpart for major elevation.

### Named Rules

**The One-Elevation Rule.** A normal card uses a border at rest or a container-level shadow, not a border-plus-shadow stack repeated at every nested level.

**The Ambient-Not-Ornamental Rule.** Glows and blur establish atmosphere and separation; they must never interfere with Quran legibility or task order.

## Shapes

The form language is gently rounded and tactile. Compact controls use 8–12px corners, fields and normal cards use 16px, major cards use 24px, the global navigator uses its established 26px capsule, and feature-level containers may extend to 32px. Pills are reserved for navigation states, compact chips, status, and circular icon targets.

Borders are soft and semantic. Inputs use the stronger border role; nested cards use the subtle role. Circular forms are useful for icon-only utilities and Quran-audio controls, but large primary actions stay softly rectangular so labels remain easy to scan.

**The Nested-Radius Rule.** Inner corners should be one step tighter than their parent container, preserving a visibly related silhouette rather than a pile of identical capsules.

## Components

### Buttons

Buttons feel calm and assured: clear blocks of semantic color, comfortable labels, and no unnecessary gloss.

- **Shape:** Soft rectangle (12px) for primary and secondary task actions; pill only for compact or navigation-like controls.
- **Primary:** Muted teal with light surface text, at least 44px tall, and 12px by 20px internal padding.
- **Accent:** Restrained amber for new work and selected warmth, never as the default review action.
- **Hover / Focus:** Hover deepens the semantic fill. Keyboard focus uses a 3px teal ring with a 3px offset; active states may compress subtly without layout shift.
- **Secondary / Ghost:** Muted surface with foreground text or transparent with a semantic border. Disabled actions retain readable text and structure while reducing emphasis.

### Chips

Chips are compact state selectors, not decorative labels.

- **Style:** Rounded or pill-shaped, with a muted track and a solid surface for the selected item.
- **State:** Selected states use a clear surface and subtle lift; unselected states keep sufficient contrast and gain foreground emphasis on hover.

### Cards / Containers

Cards feel like layered study materials placed on the same desk.

- **Corner Style:** 16px for normal cards, 24px for dashboard cards, and up to 32px for major feature containers.
- **Background:** Semantic translucent or solid surfaces; theme-specific values switch together.
- **Shadow Strategy:** Border at rest for nested cards; one soft or raised shadow at the container level.
- **Border:** Subtle by default, strong for fields or explicit boundaries.
- **Internal Padding:** 16px on compact mobile cards, usually 20–24px on standard cards, and 32px only for spacious feature framing.

### Inputs / Fields

Inputs are sturdy, legible instruments rather than floating decoration.

- **Style:** Solid semantic surface, strong semantic border, 16px corners, 48px default height, and 16px horizontal padding.
- **Focus:** Border shifts to the brand color and receives a visible teal focus ring; the field must remain legible in both themes.
- **Error / Disabled:** Error uses the danger family with an explanatory message. Disabled state lowers emphasis but keeps label and boundary readable.

### Navigation

The global navigator is a stable 52px capsule with a bordered translucent surface, soft blur, and 4px internal inset. Each destination has a 44px target. The active destination inverts to strong neutral ink/surface contrast rather than introducing a new feature color; hover uses the nearest muted surface. At narrow widths, labels compact but remain visible and do not scroll horizontally.

### Recall Chamber

The recall chamber is the signature Hifz surface: a deep navy field where the covered passage, concise recitation instruction, and Reveal action become the only strong hierarchy. It uses a 16px corner, centered content, generous vertical spacing, and a clear teal Reveal action. Once revealed, the same passage remains primary and scheduled work ends in an unmistakable self-grade choice.

### Quran Ayah Card

An ayah card uses a solid semantic surface, subtle border, 16px corners, and generous vertical rhythm. QCF V2 Arabic is right-to-left and visually primary; its locale-correct meaning sits below a subtle divider. Listening is a compact teal action. The card may highlight active playback with a teal border, but never substitutes Unicode Arabic or a generic Arabic web font for missing QCF assets.

## Do's and Don'ts

### Do:

- **Do** extend the warm-paper, deep-navy, muted-teal, and restrained-amber world through semantic tokens.
- **Do** keep ordinary interactive targets at least 44px and verify compact navigation at 390px.
- **Do** let borders and tonal layers provide normal structure, reserving shadows for container-level elevation.
- **Do** keep practice guidance concrete, concise, and in sentence case.
- **Do** preserve QCF V2 page-specific glyph mapping and let Quran content dominate reading and recall surfaces.
- **Do** keep Malay and English experiences complete and visually equivalent without mixing meanings on one screen.

### Don't:

- **Don't** introduce a separate dashboard palette, navigation language, typography system, or card grammar for a new feature.
- **Don't** use teal, amber, indigo, and status colors as equal decorative voices in the same explanatory hierarchy.
- **Don't** stack borders and strong shadows on every nested card.
- **Don't** use decorative uppercase kickers in the memorization practice flow.
- **Don't** let Ayah/Mushaf switching reset, duplicate, or visually fragment the active session.
- **Don't** replace QCF V2 Quran text with an approximate Arabic font or a shaping path that alters its page-specific glyphs.
