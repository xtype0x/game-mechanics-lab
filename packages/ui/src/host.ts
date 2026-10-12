// Contract between a project (projects/<id>) and the app that hosts it (the public site, or a standalone page).
import type { LocalizedText } from "./i18n/locale";

/** What the host tells a project page when mounting it. */
export interface ProjectHost {
  /** Link back to the host page the visitor came from, relative to the project page. Omitted when standalone.
   *  The label has one string per locale; the project shows the current locale's (`localize(label, locale)`). */
  back?: { href: string; label: LocalizedText };
}

/** Every project's package entry exports `mount` with this signature. */
export type MountProject = (el: HTMLElement, host?: ProjectHost) => void;
