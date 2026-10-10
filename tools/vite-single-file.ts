import type { Plugin } from "vite";

/**
 * Inline the built JS and CSS into index.html so the build is one self-contained file.
 * Replaces vite-plugin-singlefile, whose micromatch → braces dependency has an unpatched
 * advisory (GHSA-vfj7-8cjw-p6xm); this needs no glob matching.
 */
export function singleFile(): Plugin {
  return {
    name: "ggt:single-file",
    enforce: "post",
    config: () => ({
      base: "./",
      build: {
        assetsInlineLimit: () => true,
        chunkSizeWarningLimit: 100_000_000,
        cssCodeSplit: false,
        assetsDir: "",
        rollupOptions: { output: { codeSplitting: false } },
      },
    }),
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).filter((f) => f.type === "asset" && /\.html?$/.test(f.fileName));
      const inlined = new Set<string>();
      for (const page of html) {
        if (page.type !== "asset") continue;
        let source = String(page.source);
        for (const f of Object.values(bundle)) {
          const name = escape(f.fileName);
          if (f.type === "chunk" && /\.[mc]?js$/.test(f.fileName)) {
            const code = f.code.replace(/"?__VITE_PRELOAD__"?/g, "void 0").replace(/<(\/script>|!--)/g, "\\x3C$1").trim();
            source = source.replace(new RegExp(`<script([^>]*?) src="(?:[^"]*?/)?${name}"([^>]*)></script>`), (_, a: string, b: string) => `<script${a}${b}>${code}</script>`);
            inlined.add(f.fileName);
          } else if (f.type === "asset" && /\.css$/.test(f.fileName)) {
            const css = String(f.source).replace(`@charset "UTF-8";`, "").trim();
            source = source.replace(new RegExp(`<link([^>]*?) href="(?:[^"]*?/)?${name}"([^>]*)>`), (_, a: string, b: string) => `<style${a}${b}>${css}</style>`);
            inlined.add(f.fileName);
          }
        }
        page.source = source;
      }
      for (const name of inlined) delete bundle[name];
      for (const f of Object.values(bundle)) if (!html.includes(f)) this.warn(`not inlined: ${f.fileName}`);
    },
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
