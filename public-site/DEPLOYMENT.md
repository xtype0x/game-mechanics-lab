# 遊戲機制研究室（game-mechanics-lab）：怎麼上線與費用規劃

查核日期：2026-10-10。以下依當日官方文件；平台限制與方案之後可能調整。

## 現在不用租伺服器

目前網站建置後是 HTML、CSS、JavaScript，暴擊試算在訪客的瀏覽器裡執行。後續抽卡、傷害、行動順序等工具只要也在瀏覽器計算，就可以繼續使用靜態網站代管。靜態網站依然可以有滑桿、模擬器、互動遊戲與本機存檔。

新增一個工具通常是「新增程式 → 測試 → 建置 → 更新網站」，不用為每個工具另外租一台伺服器。模擬次數增加主要消耗訪客裝置的運算能力；流量與下載檔案大小影響網站代管。大型工具逐頁載入，大量計算再加入 Web Worker。

建議先用 **GitHub 獨立 repo + Cloudflare Pages 免費方案**。GitHub 管理程式碼，Cloudflare 幫你建置、提供公開網址與代管網站。想全部放在 GitHub，也可以使用 GitHub Pages。

## 方案比較

| 方案 | 起步費用 | 適合目前的地方 | 主要限制 |
| --- | --- | --- | --- |
| Cloudflare Pages Free | US$0 | GitHub 更新自動部署、有預覽網址；可連接公開或私有 repo | 每月 500 次建置、單一檔案 25 MiB；後端 Functions 與資料服務另有配額 |
| GitHub Pages + GitHub Free | US$0，公開 repo | 少一個平台帳號，適合開源個人工具 | 已發佈網站 1 GB、每月流量軟上限 100 GB；不執行你的後端程式 |
| Vercel Hobby | US$0 | 個人專案、部署與預覽方便 | Hobby 限個人非商業用途；未來商業化要重新評估方案 |
| 自租 VPS | 依供應商與資源付費 | 需要特定常駐服務、自己的執行環境時再考慮 | 需自行維護更新、服務、備份與部署；現在不需要 |

Cloudflare 靜態資源請求免費且不限次數，這不代表資料庫或 API 也無限免費。GitHub Pages 也有用途限制，不能用來經營以商業交易或商業 SaaS 為主的網站；未來如果轉成付費產品，應重新選平台。

私有 GitHub repo 只隱藏原始 repo；網站送到瀏覽器的 JavaScript 與資產仍可被訪客讀取。API 或資料庫密鑰不能放進前端。

## 推薦：Cloudflare Pages 上線步驟

1. 把 `public-site/` 的內容移到獨立 repo 根目錄，建議名稱 `game-mechanics-lab-site`。保留 lockfile，不帶外層研究資料與 `.git/`。
2. 執行 `npm ci`、`npm run build`，確認成功後推送到 GitHub。
3. 在 Cloudflare Pages 建立專案，選 Git 整合，連接這個新 repo。
4. 設定正式分支為你的預設分支。建置命令 `npm run build`、輸出資料夾 `dist`；新 repo 根目錄就是網站根目錄。Node 版本選已驗證的 24。
5. 部署完成後使用平台提供的 `pages.dev` 網址，不需要先買網域。
6. 之後將完成的新工具推到正式分支，就會重新建置與部署；功能分支可以先看預覽網址。

如果只是暫時從原研究 repo 部署，根目錄才填 `public-site`，其餘設定相同。長期仍建議獨立 repo，降低把本機研究資料混進公開網站的機會。

本次沒有連接外部帳號或實際部署。這些設定可以直接用於目前的 `dist/`。

## 備選：GitHub Pages 上線步驟

1. 使用新網站的公開 repo，將網站內容放在根目錄。
2. repo 的 Settings → Pages → Build and deployment，選擇 GitHub Actions。
3. 本資料夾附有 `.github/workflows/pages.yml`。搬到新 repo 後，它會成為根目錄下的 GitHub Actions workflow。
4. Actions → Deploy website to GitHub Pages → Run workflow，手動執行第一次發佈。
5. 發佈成功後網址通常是 `https://你的帳號.github.io/你的repo名稱/`。目前相對資產路徑和 hash 導覽可配合 repo 子路徑。
6. 每次更新可再手動執行；確定要自動發佈時，再為 workflow 加上正式分支的 push 觸發。預設沒有推送就立即上線的設定。

這份流程只部署 `dist/`，不會把 README、架構文件或本機研究資料當作網站檔案部署。GitHub Actions 流程尚未在遠端執行驗證。

## 什麼時候才需要花錢？

- 自訂品牌網域：可晚點買，網域是另外的年費，與伺服器租金不同。
- 雲端存檔、登入或資料收集：增加 API 與資料服務；小規模可評估免費額度，擴大後依實際用量付費。
- 長時間的大型伺服器模擬、多人即時連線或大型檔案：再評估付費運算與儲存。
- 不需為「會不斷新增工具」提前付伺服器月費。

## 更新工具的方式

完成一個功能後，在 `src/features/` 新增工具，登錄到 `src/content/games.ts`，補上規則版本與限制。先在功能分支測試，再合併到正式分支發佈。讓準備中的工具保持製作中，不把尚未完成的入口上架。

新增後端時，網站前端可繼續在 Pages；經 API 存取資料庫即可，不必把整個網站搬到 VPS。若選 GitHub Pages 作前端，登入與資料服務應交由後端／身份服務處理。

## 官方依據

- [Cloudflare Pages 免費配額：建置與檔案限制](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare 靜態資源與 Functions 計費](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Git 整合與預覽部署](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare GitHub 整合](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [GitHub Pages 可用方案、配額與用途限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Vercel Hobby 免費方案與非商業限制](https://vercel.com/docs/plans/hobby)
- [Vite 靜態部署與 GitHub Actions 流程](https://vite.dev/guide/static-deploy.html)
