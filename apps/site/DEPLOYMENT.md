# 遊戲機制研究室（game-mechanics-lab）：怎麼上線

## 現行做法（2026-10-13 決定）：公開 repo + GitHub Pages

這是唯一的現行部署方式。下方「歷史參考」只供日後換平台時比較，不要照著做。

- repo [`xtype0x/game-mechanics-lab`](https://github.com/xtype0x/game-mechanics-lab) 公開，網站在 https://xtype0x.github.io/game-mechanics-lab/ 。
- 部署由 repo 根目錄的 `.github/workflows/pages.yml` 負責：每次 push 到 `main`，依序 `npm ci` → `npm run typecheck` → `npm test` → `npm run site:build`，再把 `apps/site/dist` 發佈到 Pages。任一步失敗就不會發佈，線上維持上一版。
- 也可以在 Actions 頁手動執行（Run workflow）重新部署，但**只有選 `main` 時才會建置與發佈**；選其他分支時兩個 job 都會跳過。
- PR 與其他分支的 push 由 `.github/workflows/ci.yml` 跑同樣的檢查，但不發佈。
- `vite.config.ts` 用相對資產路徑（`base: './'`）加 hash 導覽，所以 `/game-mechanics-lab/` 子路徑不用另外設定。
- 分支規則見根目錄 [CLAUDE.md](../../CLAUDE.md) 的「分支與發佈」；授權與第三方資料見根目錄 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。

### 第一次部署前的 GitHub 設定

1. Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
2. Settings → Environments → `github-pages` → Deployment branches and tags 設成**只允許 `main`**（workflow 已限制 main，這是第二道保護）。
3. `ci.yml` 的 `check` 至少跑過一次後，再在 branch ruleset 把它設為必要檢查。

## 更新工具的方式

1. 從 `main` 開短期分支（`feat/<主題>` 等）。
2. 新工具是 `projects/<id>/` 的小專案，依 [CLAUDE.md](../../CLAUDE.md) 的「新增小專案」檢查清單建立；要出現在遊戲頁就在 `src/content/games.ts` 加工具卡片。遊戲機制寫在 `packages/core`。
3. 開 PR，`ci.yml` 通過後 squash 合併到 `main`，`pages.yml` 會自動發佈。尚未完成的工具不要放上入口。

網站全部在訪客的瀏覽器裡計算，所以新增工具不用另外租伺服器；大量計算再加入 Web Worker。若日後需要後端（登入、雲端存檔），前端可留在 Pages，經 API 存取資料服務；API 或資料庫密鑰不能放進前端。

## 歷史參考：平台比較（2026-10-10，已不採用）

以下是 2026-10-10 依當日官方文件寫的比較。當時建議把網站搬到獨立 repo 再接 Cloudflare Pages；2026-10-11 網站改留在 monorepo 的 `apps/site/`，2026-10-13 改用上方的公開 repo + GitHub Pages。平台限制與方案之後可能調整，換平台前要重新查核。

| 方案 | 起步費用 | 優點 | 主要限制 |
| --- | --- | --- | --- |
| Cloudflare Pages Free | US$0 | GitHub 更新自動部署、有預覽網址；可連接公開或私有 repo | 每月 500 次建置、單一檔案 25 MiB；後端 Functions 與資料服務另有配額 |
| GitHub Pages + GitHub Free | US$0，公開 repo | 少一個平台帳號，適合開源個人工具 | 已發佈網站 1 GB、每月流量軟上限 100 GB；不執行後端程式；不能用來經營以商業交易為主的網站 |
| Vercel Hobby | US$0 | 個人專案、部署與預覽方便 | 限個人非商業用途 |
| 自租 VPS | 依供應商與資源付費 | 需要常駐服務時再考慮 | 需自行維護更新、備份與部署 |

日後若換到 Cloudflare Pages：根目錄維持 repo 根、建置命令 `npm ci && npm run site:build`、輸出資料夾 `apps/site/dist`、Node 24。

什麼時候才需要花錢：自訂網域（另付年費）、雲端存檔／登入／資料收集（API 與資料服務）、長時間伺服器模擬或多人連線。轉成付費產品時要重新選平台。

### 官方依據（2026-10-10 查核）

- [Cloudflare Pages 免費配額：建置與檔案限制](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare 靜態資源與 Functions 計費](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Git 整合與預覽部署](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [GitHub Pages 可用方案、配額與用途限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Vercel Hobby 免費方案與非商業限制](https://vercel.com/docs/plans/hobby)
- [Vite 靜態部署與 GitHub Actions 流程](https://vite.dev/guide/static-deploy.html)
