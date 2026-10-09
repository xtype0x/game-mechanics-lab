import type { Project } from "@ggt/core";

/**
 * Builds a standalone demo HTML from the running single-file build: same inline CSS and JS, plus the project
 * embedded as window.__GGT_DEMO__. Only works from the built file (the dev server serves scripts separately).
 */
export function canExportDemo(): boolean {
  return !!document.querySelector('script[type="module"]:not([src])');
}

export function exportDemoHtml(project: Project): string {
  const script = document.querySelector('script[type="module"]:not([src])');
  if (!script) throw new Error("請在建置後的單檔版本（dist/index.html）中匯出 DEMO");
  const styles = [...document.querySelectorAll("style")].map((s) => `<style>${s.textContent ?? ""}</style>`).join("\n");
  // Escape "<" so project text can never close the script tag.
  const data = JSON.stringify(project).replace(/</g, "\u003c");
  const title = `${project.name} ・ 試玩 DEMO`.replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
${styles}
<script>window.__GGT_DEMO__ = ${data};</script>
</head>
<body>
<div id="root"></div>
<script type="module">${script.textContent ?? ""}</script>
</body>
</html>
`;
}

export function downloadDemo(project: Project) {
  const blob = new Blob([exportDemoHtml(project)], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name || "demo"}-試玩.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}
