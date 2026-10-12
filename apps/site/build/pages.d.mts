export function listProjects(): { id: string; title: string; description: string; path: string; package: string; back?: { route: string; label: string }; en: { title: string; description: string; backLabel?: string } }[];
export function allPages(): Record<string, string>;
export function writePages(opts?: { check?: boolean }): string[];
export function pageHtml(p: ReturnType<typeof listProjects>[number]): string;
export const STATIC_PAGES: Record<string, string>;
export const SITE_DIR: string;
