# 星穹鐵道戰鬥研究室（`@gml/hsr-battle`）

網站頁面 `hsr/battle/`（設定見 [project.json](./project.json)）。原為網站內的「戰鬥實驗室」，2026-10-11 獨立成小專案。編輯器、模擬器與動畫戰鬥畫面來自共用的 `@gml/ui`，規則來自 `@gml/core`。動畫戰鬥畫面取自研究 repo 的試玩 DEMO，不含標題畫面、關卡、抽卡與升級。

```bash
npm run site:dev   # http://127.0.0.1:5180/hsr/battle/
```

## 內容
可選隊伍與敵人、改角色數值與技能、預覽行動順序、批量模擬勝率，並用動畫畫面開打。修改存在瀏覽器 localStorage，按「重設」回到範本。

- **資料**：角色預設、敵人與裝備資料都來自共用套件 [`@gml/data-hsr`](../../packages/data-hsr/README.md)（資料來源、產生方式與限制也寫在那裡）。本專案只負責畫面與互動。
- **預設選單**：`src/presets/index.ts` 依序列出「範本角色」（`templates.ts`，原創角色）與「星穹鐵道」（`@gml/data-hsr/presets`）。
- **配裝面板**：`src/EquipPanel.tsx`。邏輯用 `@gml/data-hsr/equipment`，儲存用本專案的 `src/loadoutStorage.ts`。只套用無條件數值；條件效果只列出，尚未模擬。

## 對外匯出
- `.`：`mount`（網站產生的頁面呼叫它）。

## 瀏覽器儲存（鍵名沿用舊名，不可改）
`ggt.site.battle.v1`（隊伍與角色）、`ggt.site.battle.loadouts.v1`（配裝）、`ggt.site.battle.hsre-level.v1`（敵人等級）。
