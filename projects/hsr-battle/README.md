# 星穹鐵道戰鬥研究室（`@gml/hsr-battle`）

網站頁面 `hsr/battle/`（設定見 [project.json](./project.json)）。原為網站內的「戰鬥實驗室」，2026-10-11 獨立成小專案。編輯器、模擬器與動畫戰鬥畫面來自共用的 `@gml/ui`，規則來自 `@gml/core`。動畫戰鬥畫面取自研究 repo 的試玩 DEMO，不含標題畫面、關卡、抽卡與升級。

```bash
npm run site:dev   # http://127.0.0.1:5180/hsr/battle/
```

## 內容
可選隊伍與敵人、改角色數值與技能、預覽行動順序、批量模擬勝率，並用動畫畫面開打。修改存在瀏覽器 localStorage，按「重設」回到範本。

- **角色預設**：選單由 `src/presets/index.ts` 的 `presetGroups` 提供（型別見 `types.ts`），分成「範本角色」與「星穹鐵道」兩組。星穹鐵道共 98 位，由 `node scripts/build-hsr-presets.mjs` 從研究資料產生 `src/presets/hsr.generated.json`。目前 11 位可用，其餘標示尚缺哪些規則模組。資料為未核實的社群整理，著作權屬 HoYoverse。
- **敵人**：「星穹鐵道敵人」共 10 組（普通 3、精英 4、首領 3；Lv 60／70／80，預設 80）。由 `node scripts/build-hsr-encounters.mjs` 產生 `src/presets/hsr-enemies.generated.json`，用 `scripts/validate-hsr-encounters.mjs` 驗證（加 `--rates=200 --gear` 可印出勝率表）。
  - 屬性、弱點、抗性與等級曲線來自 KQM 社群資料。
  - 技能倍率、AI 與狀態數值都是標示【佔位】的估計值。
  - 韌性換算（×1/3）未核實。
- **配裝**：面板在 `src/EquipPanel.tsx`，邏輯在 `equip.ts`。每位我方角色可選光錐（疊影 1–5、Lv80）、6 件遺器（套裝、主詞條、4 條副詞條）與行跡，經核心 `applyLoadout`（`docs/spec/loadout.md`）編譯後，用於行動順序、批量模擬與動畫戰鬥。
  - 資料來自 `src/presets/hsr-equipment.generated.json`（`scripts/build-hsr-equipment.mjs`）。
  - 只套用無條件數值；條件效果只列出，尚未模擬。

## 對外匯出
- `.`：`mount`（網站產生的頁面呼叫它）。
- `./presets/*`：產生的資料檔。網站的「角色機制拆解進度」頁會讀 `hsr.generated.json`。

## 瀏覽器儲存（鍵名沿用舊名，不可改）
`ggt.site.battle.v1`（隊伍與角色）、`ggt.site.battle.loadouts.v1`（配裝）、`ggt.site.battle.hsre-level.v1`（敵人等級）。
