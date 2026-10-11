// Contract between a project (projects/<id>) and the app that hosts it (the public site, or a standalone page).

/** What the host tells a project page when mounting it. */
export interface ProjectHost {
  /** Link back to the host page the visitor came from, relative to the project page. Omitted when standalone. */
  back?: { href: string; label: string };
}

/** Every project's package entry exports `mount` with this signature. */
export type MountProject = (el: HTMLElement, host?: ProjectHost) => void;
