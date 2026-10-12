// The site's page list. Every folder in projects/ with a project.json becomes a page at its `path`; the HTML for it
// is generated here (do not edit those files by hand). Hand-written pages (home, old-link redirects) are listed below.
//   node apps/site/build/pages.mjs          write the generated pages
//   node apps/site/build/pages.mjs --check  exit 1 if a generated page is missing or out of date
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS_DIR = join(SITE_DIR, "../../projects");

/** Hand-written pages: id → path of the folder holding index.html ("" = site root). */
export const STATIC_PAGES = { main: "", "legacy-battle": "battle" };

const RESERVED = new Set(["src", "public", "build", "dist", "offline", "docs", "node_modules", ...Object.values(STATIC_PAGES).filter(Boolean)]);
const PATH_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const MARKER = "<!-- Generated from projects/";

/** Reads and checks every projects/<id>/project.json. Throws with a readable message on a bad manifest. */
export function listProjects() {
  if (!existsSync(PROJECTS_DIR)) return [];
  const seen = new Map();
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PROJECTS_DIR, d.name, "project.json")))
    .map((d) => {
      const dir = join(PROJECTS_DIR, d.name);
      const where = `projects/${d.name}/project.json`;
      const m = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const fail = (msg) => { throw new Error(`${where}: ${msg}`); };
      if (m.id !== d.name) fail(`id "${m.id}" must equal the folder name "${d.name}"`);
      if (pkg.name !== `@gml/${d.name}`) fail(`package.json name must be "@gml/${d.name}"`);
      if (!m.title || !m.description) fail("title and description are required");
      if (!PATH_RE.test(m.path ?? "")) fail(`path "${m.path}" must be lowercase words joined by "-" and "/"`);
      if (RESERVED.has(m.path.split("/")[0])) fail(`path "${m.path}" starts with a reserved folder`);
      if (seen.has(m.path)) fail(`path "${m.path}" is already used by ${seen.get(m.path)}`);
      seen.set(m.path, d.name);
      if (m.back && (!m.back.route || !m.back.label)) fail("back needs route and label");
      if (!m.en?.title || !m.en?.description) fail("en.title and en.description are required");
      if (m.back && !m.en.backLabel) fail("en.backLabel is required when back is present");
      return { ...m, package: pkg.name };
    });
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The generated HTML for one project page. */
export function pageHtml(p) {
  const up = "../".repeat(p.path.split("/").length);
  const host = p.back ? { back: { href: `${up}index.html${p.back.route}`, label: { "zh-Hant": p.back.label, en: p.en.backLabel } } } : {};
  const titles = { "zh-Hant": `${p.title} — 遊戲機制研究室`, en: `${p.en.title} — Game Mechanics Lab` };
  return `<!doctype html>
${MARKER}${p.id}/project.json by apps/site/build/pages.mjs; do not edit. -->
<html lang="zh-Hant-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="${up}favicon.svg" />
    <meta name="description" content="${esc(p.description)}" />
    <title>${esc(p.title)} — 遊戲機制研究室</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import { getLocale, subscribeLocale } from "@gml/ui/i18n";
      import { mount } from "${p.package}";
      const titles = ${JSON.stringify(titles)};
      const setTitle = () => { document.title = titles[getLocale()]; };
      setTitle();
      subscribeLocale(setTitle);
      mount(document.getElementById("root"), ${JSON.stringify(host)});
    </script>
  </body>
</html>
`;
}

/** Every page as { id: path of its index.html relative to the site folder }. */
export function allPages() {
  const pages = Object.fromEntries(Object.entries(STATIC_PAGES).map(([id, dir]) => [id, dir ? `${dir}/index.html` : "index.html"]));
  for (const p of listProjects()) pages[p.id] = `${p.path}/index.html`;
  return pages;
}

export function writePages({ check = false } = {}) {
  const stale = [];
  for (const p of listProjects()) {
    const file = join(SITE_DIR, p.path, "index.html");
    const html = pageHtml(p);
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current === html) continue;
    if (current !== null && !current.includes(MARKER)) throw new Error(`${p.path}/index.html exists and is not a generated page`);
    if (check) { stale.push(`${p.path}/index.html`); continue; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const stale = writePages({ check });
  if (stale.length) {
    console.error(`out of date (run npm run pages -w @gml/site): ${stale.join(", ")}`);
    process.exit(1);
  }
}
