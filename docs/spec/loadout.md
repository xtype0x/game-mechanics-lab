# 配裝規格

配裝規則 0.1.0。

配裝在**建立戰鬥之前**把裝備（武器、防具、套裝效果、能力節點等）編譯進單位定義。它是純函式：輸入單位定義與配裝，輸出新的單位定義與額外的狀態定義；戰鬥引擎只看到結果。這是通用機制，裝備的種類、欄位與數值都由資料決定，不寫入任何特定遊戲的規則。

## 1. 資料
```ts
type StatBonus = { key: string; op: "flat" | "pct"; value: number };

interface EquipmentPiece {
  id: string;
  name: string;
  slot: string;                    // 同一份配裝中不可重複
  setId?: string;                  // 所屬套裝
  base?: Record<string, number>;   // 基礎數值，先加進基礎池（例如武器的生命／攻擊／防禦）
  bonuses?: StatBonus[];
  innateStatuses?: string[];       // 戰鬥開始即持有的狀態（battle.md §17.2）
  passives?: PassiveDef[];
  skills?: SkillDef[];
}

interface SetTier {
  pieces: number;                  // 需要的件數（≥ 1）
  bonuses?: StatBonus[];
  innateStatuses?: string[];
  passives?: PassiveDef[];
}

interface SetDef { id: string; name: string; tiers: SetTier[] }

interface Loadout {
  pieces: EquipmentPiece[];
  sets?: SetDef[];                 // 只需列出有用到的套裝
  statuses?: StatusDef[];          // 配裝帶來的狀態定義
}
```

## 2. 編譯 `applyLoadout(unit, loadout) → { unit, statuses }`
1. **基礎池** `B = {...unit.stats}`。依 `pieces` 順序，對每件的 `base` 每個鍵（定義順序）：`B[k] = (B[k] ?? 0) + v`。
2. **收集加成**（順序固定）：
   1. 依 `pieces` 順序，每件的 `bonuses`；
   2. 依 `sets` 順序，對每個套裝：`n` = `pieces` 中 `setId` 等於它的件數；依 `tiers` 順序，`n ≥ pieces` 的每一階的 `bonuses`。
3. **合計**：對每個出現的鍵，依收集順序從 0 開始累加：`P[k]`（pct）與 `F[k]`（flat）。
4. **最終數值**：`stats = {...B}`；對每個在 P 或 F 出現的鍵（依第一次出現的順序）：
   `stats[k] = (B[k] ?? 0) × (1 + P[k]) + F[k]`（沒有的一方為 0；運算順序照寫，不重排）。
   不取整。
5. **其他欄位**（依同樣的收集順序串接在單位原有內容之後）：
   - `skills = unit.skills ++ 每件的 skills`
   - `passives = (unit.passives ?? []) ++ 每件的 passives ++ 生效套裝階的 passives`
   - `innateStatuses = (unit.innateStatuses ?? []) ++ 每件的 innateStatuses ++ 生效套裝階的 innateStatuses`（保留重複，引擎照順序施加；同 ID 照 §17.2 疊加）
6. `statuses = loadout.statuses ?? []`。其他欄位照抄。

## 3. 驗證
- 錯誤：同一 `slot` 出現兩次；`setId` 不在 `sets`；`pieces < 1`；`innateStatuses` 指向不存在的狀態（含單位原有、配裝帶來與專案狀態）；技能或被動 ID 與單位原有的重複。
- 提醒：`bonuses` 的鍵不是單位數值也不是傷害規則宣告的統計值（不會有效果）。
- 實作細節：`pieces < 1` 指套裝階的 `pieces`；開場狀態指向的是帶 `dot` 的狀態也是錯誤（battle.md §17.2）；開場狀態、技能與被動 ID 重複的檢查涵蓋所有階（不論是否生效），且只比對單位原有的；開場狀態只要在單位、配裝或專案任一處有定義即可；上述提醒只在呼叫端提供傷害規則的統計值鍵時才檢查。

## 4. 相容性
空配裝（`pieces` 為空、沒有 sets）回傳與輸入相同的單位（`innateStatuses` 不會被新增）。
