# gacha-game-tool — 給玩家與開發者的個人遊戲工具網站

可整包移到獨立 GitHub repo 的本機原型。此資料夾有自己的依賴、型別設定與建置設定，不屬於外層 npm workspace，不引用外層 core、console、data，也沒有修改目前正在開發的工具。

目前以二遊官網致敬版作為主要視覺方向，完整計畫動機已放入「關於計畫」。尚未建立獨立 GitHub 遠端 repo、推送或上線；中文名稱、作者身份、聯絡方式與遠端 repo 連結待補。

## 使用

Node.js 22.12+（建議 Node 24）。在此資料夾執行：

```powershell
npm ci
npm run dev
```

預覽：<http://127.0.0.1:5180/>。`npm run build` 會先檢查型別，再產生 `dist/`；`npm run preview` 預覽建置結果。本網站有自己的依賴，請在此資料夾執行 `npm ci`，搬到新 repo 後也同樣操作。

`npm run build:offline` 另外產生 `offline/index.html`、`offline/gacha/index.html` 與 `offline/battle/index.html`，可直接用瀏覽器開啟，不必啟動預覽服務，方便先查看這次原型。

## 目前內容

- 首頁：原創二遊主視覺、青金配色，以宣傳官網語彙致敬與幽默文案介紹遊戲機制工具。
- 工具遊樂場：抽卡模擬器入口，開啟獨立頁面 `gacha/`（從 `packages/gacha-sim` 搬入，核心規則取自 `src/lib/core/`，`@ggt/core` 以別名指向它）。另有星穹鐵道戰鬥研究室（原「戰鬥實驗室」）入口，開啟獨立頁面 `battle/`（規則核心同樣複製自 `packages/core`；動畫戰鬥畫面取自研究 repo 的試玩 DEMO，不含標題畫面、關卡、抽卡與升級）。
- 關於計畫：從台灣出發的計畫動機；另有資料與使用說明頁。
- 響應式排版、鍵盤操作與跳至內容連結。

星穹鐵道戰鬥研究室可選隊伍與敵人、改角色數值與技能（存在瀏覽器 localStorage，「重設」回範本）、預覽行動順序、批量模擬勝率並用動畫畫面開打；角色預設選單由 `src/tools/battle/presets/index.ts` 的 `presetGroups` 提供（型別見同資料夾 `types.ts`），有「範本角色」與「星穹鐵道」（98 位，由 `node scripts/build-hsr-presets.mjs` 從研究資料產生 `presets/hsr.generated.json`；目前 2 位可用，其餘標示尚缺的規則模組；資料為未核實的社群整理，著作權屬 HoYoverse）。

「敵方」選單另有「星穹鐵道敵人」10 組（普通 3、精英 4、首領 3，Lv 60／70／80，預設 80）：由 `node scripts/build-hsr-encounters.mjs` 從研究資料產生 `presets/hsr-enemies.generated.json`（連同 `scripts/validate-hsr-encounters.mjs` 驗證；`--rates=200 --gear` 可印勝率表）。屬性、弱點、抗性與等級曲線來自 KQM 社群資料，技能倍率、AI 與狀態數值皆為標示【佔位】的估計值，韌性換算（×1/3）未核實。

「配裝」面板（`src/tools/battle/EquipPanel.tsx`，邏輯在 `equip.ts`）可為每位我方角色選光錐（疊影 1–5、Lv80）、6 件遺器（套裝、主詞條、4 條副詞條）與行跡，並以核心 `applyLoadout`（`docs/spec/loadout.md`）編譯後用於行動順序、批量模擬與動畫戰鬥；資料來自 `presets/hsr-equipment.generated.json`（`scripts/build-hsr-equipment.mjs`），只套用無條件數值，條件效果僅列出、尚未模擬；配裝存在 localStorage 的 `ggt.site.battle.loadouts.v1`。

網站本身沒有帳號或分析追蹤功能。抽卡模擬器的設定存在瀏覽器本機，開啟時會讀取公開卡池資料，說明見資料與使用說明頁。

搬入時沒有帶入模擬器的測試與 `scripts/update-snapshot.ts`；之後若要同步更新，仍以 `packages/gacha-sim` 為來源。

詳細規劃與搬移步驟：[ARCHITECTURE.md](./ARCHITECTURE.md)。

檢查結果：[docs/VERIFICATION.md](./docs/VERIFICATION.md)。

主要視覺與生成提示詞：[docs/HOMEPAGE-V4-DESIGN.md](./docs/HOMEPAGE-V4-DESIGN.md)。首頁畫面：[docs/homepage-hero-v4.jpg](./docs/homepage-hero-v4.jpg)。主視覺角落保留 AI 生成圖像註記，桌面與手機皆可見。

## 建立獨立 repo

1. 將整個 `public-site/` 複製到目前研究 repo **以外**的新資料夾，例如 `gacha-game-tool-site/`；不要複製 `node_modules/`、`dist/`、`offline/` 或任何 `.git/`。
2. 在新資料夾執行 `npm ci`、`npm run build`，確認可獨立建置。
3. 在新資料夾建立 Git repo，建立獨立的 GitHub repo 再推送。不要把外層研究 repo 的歷史直接公開。
4. 先補作者介紹、聯絡入口、採用的程式碼授權與實際 GitHub 連結，再開放訪客試用。
5. 可把建置產物 `dist/` 放到靜態網站主機。選 GitHub Pages 時使用 Vite 官方建置部署流程；網站目前用相對資產路徑與 hash 導覽，可放在 repo 子路徑，不需伺服器路由回退。

上線方案與費用比較：[DEPLOYMENT.md](./DEPLOYMENT.md)。建議 GitHub + Cloudflare Pages 免費起步；備選 GitHub Pages 的手動部署 workflow 已附上，尚未實際推送或部署。瀏覽器導覽採 `#/lab` 等路徑；研究文章數量增加並需要搜尋曝光時，加入靜態預渲染並轉成實體 URL。

參考：[Vite 靜態部署](https://vite.dev/guide/static-deploy.html)。
