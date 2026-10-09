# 參考資料包格式（參考資料匯入工具）

主控台的「參考資料匯入」工具讀取使用者自己蒐集的研究資料，轉成**可編輯的角色／敵人草稿**。資料包只存在瀏覽器分頁的記憶體裡，不會寫進專案檔、建置檔或匯出的 DEMO；匯入後的單位是普通專案內容，帶有 `source` 欄位標示來源。

轉換函式在 `packages/core/src/library/reference.ts`（純函式，有測試 `reference.test.ts`）。

## 頂層

```jsonc
{
  "kind": "ggt-reference-pack",
  "schemaVersion": 1,
  "title": "顯示名稱",
  "caveats": ["版本、授權、精度等注意事項（工具會醒目顯示）"],
  "sources": [{ "id": "快照 ID", "status": "unverified", "version": null, "note": "" }],
  "elementNames": ["Fire", "Ice", "..."],          // 來源的屬性名稱，用於對照表
  "statusCategoryNames": ["Frozen", "..."],         // 來源的異常類別名稱
  "enemyCurves": { "hp": [], "attack": [], "defense": [], "speed": [], "effHitRate": [], "effRes": [] },
  "enemies": [ /* RefEnemy */ ],
  "characters": [ /* RefCharacter */ ],
  "interactions": [ /* RefInteraction，選填 */ ]
}
```

## 敵人 `RefEnemy`

| 欄位 | 說明 |
|---|---|
| `key` | 來源內穩定的鍵；**不要**猜測遊戲 ID |
| `name`、`variantLabel`、`group` | 顯示用 |
| `coeff` | `{hp, atk, def, spd, effectResBase}`：等級曲線係數 |
| `toughness` | 來源原始刻度；匯入時乘以「韌性換算倍率」 |
| `weaknesses` | 來源屬性名稱 |
| `elementRes` | 來源屬性名稱 → 抗性（0.2 = 20%） |
| `statusRes` | 來源異常類別 → 抵抗 |
| `skills` | `{name, type, desc, phases?}`；只有文字，沒有倍率 |

等級數值：`stat(level) = coeff × curve[level − 1]`，效果抵抗為 `effectResBase + effRes[level − 1]`，效果命中為 `effHitRate[level − 1]`。不取整。

轉換規則：
- 屬性與異常類別依工具中的對照表轉成專案的鍵；沒有對照的屬性會略過並提示。
- `type == "Ability"` 且描述含「DMG」的技能 → 傷害技能。目標依描述判斷（all targets → 全體、adjacent → 擴散、其他 → 單體）；倍率依用詞給**佔位值**（minor 100%、moderate 200%、heavy/massive 300%），說明欄標示【佔位倍率】。
- 其他技能與天賦寫入單位說明，不自動轉成效果。
- AI 為每個轉換出的技能權重 1。

## 角色 `RefCharacter`

| 欄位 | 說明 |
|---|---|
| `id`、`name`、`rarity`、`path`、`element` | 基本資料 |
| `maxEnergy` | 大招能量上限 |
| `promotions` | 每個突破階段一筆：`{stat: {base, step}}`，數值 = `base + step × (level − 1)` |
| `skills` | `{id, name, type, typeText, effect, maxLevel, desc, params}`；`params[level − 1]` 是該等級的參數 |

轉換規則：
- 突破階段依等級推算：`max(0, ceil((level − 20) / 10))`。
- `Normal`／`BPSkill`／`Ultra` → 普攻／戰技／大招（各取第一個；同類型的強化版寫入說明）。其他類型（天賦、秘技等）寫入說明。
- `effect` 為 SingleAttack／Blast／AoEAttack／Bounce 時，倍率**推測**為參數 1（擴散的相鄰倍率為參數 2），並在說明中提醒確認；其他效果（護盾、治療、增益）需要手動設定。
- 預設技能等級：普攻 6、其他 10（不超過 `maxLevel`）。
- 不含裝備、行跡、星魂等加成。

## 互動 `RefInteraction`（選填）

`{id, enemyKey, title, summary, needs[], coverage?: {supported[], missing[]}}`。工具在敵人詳情中顯示，`coverage` 說明目前規則能表達哪些部分。

## 產生資料包

`scripts/build-*-pack.mjs` 可從本機研究快照產生資料包（例如 `node scripts/build-hsr-pack.mjs` → `data/reference/hsr/pack.json`）。這類腳本與輸出檔屬於研究資料，不隨工具發佈。
