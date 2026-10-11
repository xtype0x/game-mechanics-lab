# 遊戲機制研究室（game-mechanics-lab）— 研究熱門遊戲機制的個人網站

2026-10-11 由 `gacha-game-tool` 改名；舊的驗證紀錄與設計提示詞保留原名。程式內部的 `@ggt/*` 套件名與瀏覽器儲存鍵 `ggt.*` 刻意沿用，避免訪客的本機設定失效。

研究 repo 的 npm workspace 成員 `@ggt/site`（`apps/site/`；2026-10-11 由 `public-site/` 搬入，決定與研究 repo 放在同一個 repo）。規則核心直接使用 `packages/core`（`@ggt/core` 別名指向 `../../packages/core/src/index.ts`），不再複製一份。不引用 `data/` 的本機研究資料；HSR 資料只透過 `scripts/build-hsr-*.mjs` 產生的 `*.generated.json` 進入網站。

目前以二遊官網致敬版作為主要視覺方向，完整計畫動機已放入「關於計畫」。尚未正式上線；中文名稱、作者身份、聯絡方式與遠端 repo 連結待補。

## 使用

Node.js 22.12+（建議 Node 24）。依賴由 repo 根目錄統一安裝，在**根目錄**執行：

```powershell
npm ci
npm run site:dev
```

預覽：<http://127.0.0.1:5180/>。`npm run site:build` 會先檢查型別，再產生 `apps/site/dist/`；`npm run preview -w @ggt/site` 預覽建置結果。根目錄的 `npm run typecheck` 也會檢查本網站。

`npm run site:build:offline` 另外產生 `offline/index.html`、`offline/gacha/index.html`、`offline/hsr/battle/index.html` 與舊連結用的 `offline/battle/index.html`（轉址頁）。離線建置以 `--mode hsr-battle` 對應巢狀的 `hsr/battle/`，可直接用瀏覽器開啟，不必啟動預覽服務，方便先查看這次原型。

## 目前內容

- 首頁：原創二遊主視覺、青金配色，以宣傳官網語彙致敬與幽默文案介紹遊戲機制工具。
- 網站以「遊戲」為主軸（2026-10-11 由工具分類改版）。導覽（hash 路由）：`#/` 首頁、`#/games` 遊戲一覽、`#/games/<id>` 各遊戲的研究基地（工具卡片、資料來源與免責聲明）、`#/games/hsr/coverage` 星穹鐵道角色機制拆解進度、`#/tools` 跨遊戲工具、`#/about`、`#/privacy`；舊的 `#/lab` 會自動轉到 `#/tools`，舊的 `battle/index.html` 是轉址頁，會跳到 `hsr/battle/index.html`。
- 新增遊戲：在 `src/content/games.ts` 的 `games` 陣列加一筆（順序＝研究深度，其次熱門程度；`id` 要與抽卡模擬器目錄 `src/tools/gacha/catalog/games.ts` 一致，抽卡深連結才會生效）。`src/content/experiments.ts` 已移除，併入 `games.ts`。
- 頁面檔：`src/pages/Games.tsx`（一覽與研究基地）、`src/pages/Coverage.tsx`（進度頁，以動態 import 載入 `hsr.generated.json`，首頁 JS 不增加）、`src/pages/shared.tsx`。
- 抽卡模擬器：入口 `gacha/`，原為 `packages/gacha-sim`（已併入並移除，說明見 [src/tools/gacha/README.md](./src/tools/gacha/README.md)），核心規則取自 `packages/core`。支援網址參數 `?game=<id>`（例如 `gacha/index.html?game=genshin`），載入時預選該遊戲的第一種卡池，只影響該次載入（會蓋過已存的選擇，但帶有 `#rules=` 分享連結時以分享為準）；返回連結改指向 `#/tools`。
- 星穹鐵道戰鬥研究室（原「戰鬥實驗室」）：獨立頁面 `hsr/battle/`（規則核心同樣直接使用 `packages/core`；動畫戰鬥畫面取自研究 repo 的試玩 DEMO，不含標題畫面、關卡、抽卡與升級）。
- 關於計畫：從台灣出發的計畫動機；另有資料與使用說明頁。
- 響應式排版、鍵盤操作與跳至內容連結。

星穹鐵道戰鬥研究室可選隊伍與敵人、改角色數值與技能（存在瀏覽器 localStorage，「重設」回範本）、預覽行動順序、批量模擬勝率並用動畫畫面開打；角色預設選單由 `src/tools/battle/presets/index.ts` 的 `presetGroups` 提供（型別見同資料夾 `types.ts`），有「範本角色」與「星穹鐵道」（98 位，由 `node scripts/build-hsr-presets.mjs` 從研究資料產生 `presets/hsr.generated.json`；目前 11 位可用，其餘標示尚缺的規則模組；資料為未核實的社群整理，著作權屬 HoYoverse）。

「敵方」選單另有「星穹鐵道敵人」10 組（普通 3、精英 4、首領 3，Lv 60／70／80，預設 80）：由 `node scripts/build-hsr-encounters.mjs` 從研究資料產生 `presets/hsr-enemies.generated.json`（連同 `scripts/validate-hsr-encounters.mjs` 驗證；`--rates=200 --gear` 可印勝率表）。屬性、弱點、抗性與等級曲線來自 KQM 社群資料，技能倍率、AI 與狀態數值皆為標示【佔位】的估計值，韌性換算（×1/3）未核實。

「配裝」面板（`src/tools/battle/EquipPanel.tsx`，邏輯在 `equip.ts`）可為每位我方角色選光錐（疊影 1–5、Lv80）、6 件遺器（套裝、主詞條、4 條副詞條）與行跡，並以核心 `applyLoadout`（`docs/spec/loadout.md`）編譯後用於行動順序、批量模擬與動畫戰鬥；資料來自 `presets/hsr-equipment.generated.json`（`scripts/build-hsr-equipment.mjs`），只套用無條件數值，條件效果僅列出、尚未模擬；配裝存在 localStorage 的 `ggt.site.battle.loadouts.v1`。

網站本身沒有帳號或分析追蹤功能。抽卡模擬器的設定存在瀏覽器本機，開啟時會讀取公開卡池資料，說明見資料與使用說明頁。

抽卡模擬器的測試在 `test/gacha/`（根目錄 `npm test` 執行），卡池快照用根目錄 `npm run site:snapshot` 更新。

詳細規劃與搬移步驟：[ARCHITECTURE.md](./ARCHITECTURE.md)。

檢查結果：[docs/VERIFICATION.md](./docs/VERIFICATION.md)。

主要視覺與生成提示詞：[docs/HOMEPAGE-V4-DESIGN.md](./docs/HOMEPAGE-V4-DESIGN.md)。首頁畫面：[docs/homepage-hero-v4.jpg](./docs/homepage-hero-v4.jpg)。主視覺角落保留 AI 生成圖像註記，桌面與手機皆可見。

## 上線前

1. 先補作者介紹、聯絡入口、採用的程式碼授權與實際 GitHub 連結，再開放訪客試用。
2. 只部署建置產物 `apps/site/dist/`，不要公開研究 repo 本身（含 `data/` 與歷史）。網站用相對資產路徑與 hash 導覽，可放在子路徑，不需伺服器路由回退。

上線方案與費用比較：[DEPLOYMENT.md](./DEPLOYMENT.md)（其中「搬到獨立 repo」的步驟寫於 2026-10-10，已被同 repo 的決定取代；部署平台尚未決定）。`.github/workflows/pages.yml` 是當時為獨立 repo 準備的範本，放在子資料夾內不會執行。瀏覽器導覽採 `#/games/hsr` 等路徑；研究文章數量增加並需要搜尋曝光時，加入靜態預渲染並轉成實體 URL。

參考：[Vite 靜態部署](https://vite.dev/guide/static-deploy.html)。
