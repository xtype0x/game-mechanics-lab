# 遊戲機制研究室（game-mechanics-lab）— 研究熱門遊戲機制的個人網站

2026-10-11 由 `gacha-game-tool` 改名；舊的驗證紀錄與設計提示詞保留原名。程式內部套件名 2026-10-11 由 `@ggt/*` 改為 `@gml/*`；瀏覽器儲存鍵 `ggt.*` 與檔案／分享格式名（如 `ggt-gacha-rules`）刻意沿用，避免訪客的本機設定與分享連結失效。

研究 repo 的 npm workspace 成員 `@gml/site`（`apps/site/`；2026-10-11 由 `public-site/` 搬入，與研究 repo 放在同一個 repo）。網站是**外殼**：首頁、遊戲頁與說明頁。各個工具與 DEMO 是 `projects/<id>/` 的小專案，網站依各專案的 `project.json` 自動產生頁面（見下方「專案頁面」）。整體架構與規則見根目錄 [CLAUDE.md](../../CLAUDE.md)。

目前以二遊官網致敬版作為主要視覺方向，完整計畫動機已放入「關於計畫」。尚未正式上線；中文名稱、作者身份、聯絡方式與遠端 repo 連結待補。

## 使用

Node.js 22.12+（建議 Node 24）。依賴由 repo 根目錄統一安裝，在**根目錄**執行：

```powershell
npm ci
npm run site:dev
```

預覽：<http://127.0.0.1:5180/>。`npm run site:build` 會先檢查型別，再產生 `apps/site/dist/`；`npm run preview -w @gml/site` 預覽建置結果。根目錄的 `npm run typecheck` 也會檢查本網站。

`npm run site:build:offline` 另外把每一頁各自建置成單檔 HTML，放在 `offline/`（首頁、每個專案頁，以及舊連結用的 `offline/battle/index.html` 轉址頁），可直接用瀏覽器開啟，不必啟動預覽服務。

## 專案頁面

- `build/pages.mjs` 讀取每個 `projects/<id>/project.json`，在網站的 `<path>/index.html` 產生頁面（頁面標題、說明、返回連結都從 `project.json` 來）。頁面會載入 `@gml/<id>` 並呼叫它的 `mount()`。
- 產生的 HTML 有提交進 git，**不要手改**。`npm run dev`／`build` 執行前會自動重新產生；也可以手動執行 `npm run pages -w @gml/site`。
- `vite.config.ts`、`vite.offline.config.ts` 與 `build/offline.mjs` 的頁面清單也由 `pages.mjs` 提供，新增專案時不必改設定。
- 手寫頁面：首頁 `index.html`，以及舊連結轉址頁 `battle/index.html`，列在 `pages.mjs` 的 `STATIC_PAGES`。
- `test/pages.test.ts` 會檢查兩件事：產生的頁面是否為最新，以及 `src/content/games.ts` 的工具連結是否都指向存在的頁面。

## 目前內容

- 首頁：原創二遊主視覺、青金配色，以宣傳官網語彙致敬與幽默文案介紹遊戲機制工具。
- 網站以「遊戲」為主軸（2026-10-11 由工具分類改版）。導覽（hash 路由）：`#/` 首頁、`#/games` 遊戲一覽、`#/games/<id>` 各遊戲的研究基地（工具卡片、資料來源與免責聲明）、`#/games/hsr/coverage` 星穹鐵道角色機制拆解進度、`#/tools` 跨遊戲工具、`#/about`、`#/privacy`；舊的 `#/lab` 會自動轉到 `#/tools`，舊的 `battle/index.html` 是轉址頁，會跳到 `hsr/battle/index.html`。
- 新增遊戲：在 `src/content/games.ts` 的 `games` 陣列加一筆（順序＝研究深度，其次熱門程度；`id` 要與抽卡模擬器目錄 `projects/gacha-sim/src/catalog/games.ts` 一致，抽卡深連結才會生效）。`src/content/experiments.ts` 已移除，併入 `games.ts`。
- 頁面檔：`src/pages/Games.tsx`（一覽與研究基地）、`src/pages/Coverage.tsx`（進度頁，以動態 import 載入 `@gml/hsr-battle/presets/hsr.generated.json`，首頁 JS 不增加）、`src/pages/shared.tsx`。
- 專案頁面：抽卡模擬器 `gacha/`（[projects/gacha-sim](../../projects/gacha-sim/README.md)，支援 `?game=<id>` 預選遊戲），以及星穹鐵道戰鬥研究室 `hsr/battle/`（[projects/hsr-battle](../../projects/hsr-battle/README.md)）。
- 關於計畫：從台灣出發的計畫動機；另有資料與使用說明頁。
- 響應式排版、鍵盤操作與跳至內容連結。

網站本身沒有帳號或分析追蹤功能。抽卡模擬器的設定存在瀏覽器本機，開啟時會讀取公開卡池資料，說明見資料與使用說明頁。

詳細規劃與搬移步驟：[ARCHITECTURE.md](./ARCHITECTURE.md)。

檢查結果：[docs/VERIFICATION.md](./docs/VERIFICATION.md)。

主要視覺與生成提示詞：[docs/HOMEPAGE-V4-DESIGN.md](./docs/HOMEPAGE-V4-DESIGN.md)。首頁畫面：[docs/homepage-hero-v4.jpg](./docs/homepage-hero-v4.jpg)。主視覺角落保留 AI 生成圖像註記，桌面與手機皆可見。

## 上線前

1. 先補作者介紹、聯絡入口、採用的程式碼授權與實際 GitHub 連結，再開放訪客試用。
2. 只部署建置產物 `apps/site/dist/`，不要公開研究 repo 本身（含 `data/` 與歷史）。網站用相對資產路徑與 hash 導覽，可放在子路徑，不需伺服器路由回退。

上線方案與費用比較：[DEPLOYMENT.md](./DEPLOYMENT.md)（其中「搬到獨立 repo」的步驟寫於 2026-10-10，已被同 repo 的決定取代；部署平台尚未決定）。`.github/workflows/pages.yml` 是當時為獨立 repo 準備的範本，放在子資料夾內不會執行。瀏覽器導覽採 `#/games/hsr` 等路徑；研究文章數量增加並需要搜尋曝光時，加入靜態預渲染並轉成實體 URL。

參考：[Vite 靜態部署](https://vite.dev/guide/static-deploy.html)。
