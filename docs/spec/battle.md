# 回合戰鬥規格

戰鬥直接使用專案的傷害規則（damage.md）計算每段命中。所有狀態都是純 JSON；給定（設定, 種子, 行動序列）結果完全確定。

## 1. 設定
- `rules`：`avBase`、`firstCycleAv`、`cycleAv`、`spStart`、`spMax`、`energyOnHitTaken`、`energyOnKill`、`breakDelay`、`breakDamage`（表示式）、`maxCycles`、`rounding`。
- `units`：單位定義（`id`、`name`、`team`、`element`、`stats`、`weaknesses`、`skills`、`ai`）。
- `statuses`：狀態定義。
- `encounter`：`allies`、`enemies` 兩個單位 ID 陣列（可重複）。
- `damage`：由專案 `damage.config` 經 damage.md §3 組合出的傷害規則。

## 2. 建立戰鬥
1. 依 `allies` 再 `enemies` 的順序建立單位：`uid` = `A<i+1>`／`E<i+1>`，`slot` = i。
2. `hp = maxHp = stats.hp ?? 1`；`energy = stats.startEnergy ?? 0`；`maxEnergy = stats.maxEnergy ?? 0`；`toughness = maxToughness = stats.toughness ?? 0`；`broken = false`；`statuses = []`。
3. `sp = spStart`，`time = 0`，`cycle = 1`，`turns = 0`，事件 `[{cycle:1, time:0}]`。
4. 亂數流：`Rng(seed, "battle.crit")`、`Rng(seed, "battle.status")`、`Rng(seed, "battle.ai")`。
5. 每個單位 `av = fullAv(u)`，然後執行主迴圈（§4）。

## 3. 數值
### 3.1 單位數值 `unitStat(u, key)`
`base = u.stats[key]`，缺少時取傷害規則中第一個 `key` 相同的統計值預設（不分 side），再缺少為 0。
套用 u 身上所有狀態中 `target == "stat:<key>"` 的修正（§3.3），以 damage.md §2 的修正值模型計算，無上下限、無取整、無條件。

### 3.2 行動值
`fullAv(u) = avBase / unitStat(u, "spd")`；速度必須 > 0。

**保距離規則**：任何可能改變 u 速度的操作（加入、刷新、移除狀態）前後各算一次速度；若不同且新速度 > 0，`u.av = u.av × 舊速度 / 新速度`。

### 3.3 狀態修正轉換
狀態修正只有 `target`、`op`、`value`、`role` 四個欄位，沒有 `enabled` 或條件。
對每個狀態實例（列表順序）的每個修正（定義順序）：
- 數值：`add`／`pct` 為 `value × stacks`；`mul` 為 `value ^ stacks`；`override` 為 `value`。
- `stat:<key>`：
  - 持有者是攻擊方時，轉為 `stat:attacker.<key>`；
  - 持有者是防守方時，轉為 `stat:defender.<key>`；
  - 用於 §3.1 時保持 `stat:<key>`。
- `step:<id>`：`role` 省略時為 `outgoing`。持有者攻擊時只取 `outgoing`，被攻擊時只取 `incoming`。

### 3.4 傷害情境
**元素**：技能命中與削韌使用 `skill.element ?? 行動者.element`；持續傷害使用 `dot.element`。

攻擊方 X 打防守方 Y 時，damage.md 的情境為：
- `attacker = X.stats`、`defender = Y.stats`。
- `flags = { broken: Y.broken, weakness: Y.weaknesses 包含 element }`。
- `modifiers = X 的攻擊方修正 ++ Y 的防守方修正`。

## 4. 主迴圈
重複執行：
1. 若已結束，或 `checkEnd` 成立，則停止。`checkEnd`：
   - 沒有存活敵人 → `win`；
   - 否則若沒有存活我方 → `lose`；
   - 成立時加入 `end` 事件、清除決策。
2. **下一位行動者**：存活單位依下列順序排序，取第一個：
   - `av` 小者優先；
   - 平手時，同隊比 `slot`，異隊我方優先。
   - 比較使用**精確浮點值**。移植版本必須用相同的運算順序更新 av，平手判定才會一致。
3. `elapsed = next.av`，`newTime = time + elapsed`，`newCycle = cycleAt(newTime)`。若 `newCycle > maxCycles`，以 `timeout` 結束，且**不**更新時間。
   - `cycleAt(t) = t < firstCycleAv ? 1 : 2 + floor((t − firstCycleAv) / cycleAv)`
4. 所有存活單位 `av −= elapsed`，然後 `next.av = 0`，`time = newTime`。cycle 每增加 1 就加入一個 `cycle` 事件。
5. `turns += 1`，加入 `turn` 事件。
6. 若 `next.broken`：設 `broken = false`、`toughness = maxToughness`，加入 `recover` 事件。
7. **持續傷害**：依狀態列表順序（迭代開始時的副本）處理每個有 `dot` 的實例（持有者需存活）：
   - 攻擊方數值 = 該實例的 `snapshot`；修正值**只有**持有者作為防守方的修正（§3.3），沒有攻擊方修正；
   - 技能 = `{type:"dot", element: dot.element, multiplier: dot.multiplier × stacks, hits:[1]}`；
   - 第 0 段、不暴擊；
   - 以 `kind:"dot"`、來源 `sourceUid` 造成傷害（§5.6）。
8. 若行動者已死亡，回到步驟 1；若 `checkEnd` 成立，停止。
9. 若有任一 `skipTurn` 狀態：以第一個這種狀態的名稱加入 `skip` 事件，執行回合結束（§4.1），回到步驟 1。
10. 我方：設定決策 `{actorUid}` 並等待輸入。敵方：依 §6 決定行動並執行（§5）；若仍存活，執行回合結束。

### 4.1 回合結束
在保距離規則內：
1. 所有狀態 `turnsLeft −= 1`；
2. 移除 `turnsLeft ≤ 0` 者，依列表順序加入 `expired` 事件。

最後 `av = fullAv(u)`。

## 5. 執行技能
1. 加入 `action` 事件。
2. 行動者為我方且 `spDelta ≠ 0`：`sp = clamp(sp + spDelta, 0, spMax)`，加入 `sp` 事件。
3. 大招：`energy = 0`。接著 `energy = energy + energyGain`。能量一律限制在 [0, maxEnergy]；有變化才加入 `energy` 事件。
4. 依序處理每個效果：先決定目標（§5.1），依「主目標，再相鄰目標」的順序，對每個存活目標套用效果。傷害效果套用到對手（套用前存活即可，即使被打死）後，將其記入本行動的「被擊中集合」（保持插入順序）。
5. 所有效果結束後，被擊中集合中存活的我方單位各加 `energyOnHitTaken` 能量。

### 5.1 目標
存活對手與存活友方各依 slot 排序。`chosen` 為行動指定的 uid。

**若 `chosen` 指向一個已死亡的單位（例如被同一技能較早的效果打死），`enemy`／`blast`／`ally` 模式的主目標與相鄰目標皆為空，不改選其他目標。** 其他情況（`chosen` 省略、uid 不存在、或指向存活但不在該列表中的單位，例如隊伍不符）使用下表的預設。`self`、`allEnemies`、`allAllies` 不看 `chosen`。

| 模式 | 主目標 | 相鄰目標 |
|---|---|---|
| enemy | chosen（不在對手列表時取第一個對手） | 無 |
| blast | 同 enemy | 主目標在對手列表中的前一個與後一個（存在者，先前後後） |
| allEnemies | 全部對手 | 無 |
| self | 自己 | 無 |
| ally | chosen（不在友方列表時取自己） | 無 |
| allAllies | 全部友方 | 無 |

### 5.2 傷害效果
- `hits = hits ?? [1]`。
- 倍率與削韌：主目標用 `multiplier`／`toughness`，相鄰目標用 `adjMultiplier ?? 0`／`adjToughness ?? 0`。
- 對 i = 0..：目標仍存活時才處理：
  1. 依 §3.4 建立情境（每段重建，因為擊破會改變旗標）。
  2. `p = critChanceOf(情境)`（damage.md §4.3）。
  3. `crit = critRng.chance(p)`，**每段固定消耗一次**。
  4. 用 damage.md §4.2 計算第 i 段傷害，造成 `kind:"hit"` 傷害（§5.6）。
  5. 若目標仍存活：削韌 `toughness × hits[i]`（§5.3）。

### 5.3 削韌與擊破
1. 下列任一情況成立時跳過：
   - 削韌量 ≤ 0；
   - 目標已擊破；
   - `maxToughness ≤ 0`；
   - 元素不在目標弱點中。
2. `toughness = max(0, toughness − 量)`，加入 `toughness` 事件。仍大於 0 則結束。
3. 歸零時：`broken = true`，加入 `break` 事件。
4. 擊破傷害：以 `{type:"skill", multiplier:0, hits:[1], element}` 建立情境（此時 `broken` 已為 true），解出最終統計值。
   - scope：
     - `attacker = {...行動者.stats, ...攻擊方最終值, breakEffect: unitStat(行動者, "breakEffect")}`
     - `defender = {...目標.stats, ...防守方最終值, maxToughness}`
   - 傷害量 = `rounding(max(0, breakDamage))`，以 `kind:"break"` 造成傷害。
5. 若目標仍存活：`av += fullAv(目標) × breakDelay`，加入 `advance` 事件。

### 5.4 治療、能量、推進
- **治療**：`base = scale == "atk" ? unitStat(行動者, "atk") : 目標.maxHp`；`量 = rounding(base × multiplier + flat)`；`hp = min(maxHp, hp + 量)`；事件記實際回復量。
- **推進**：`av = max(0, av − fullAv(目標) × amount)`。
- **能量**：`energy + amount`，限制在 [0, maxEnergy]。

### 5.5 狀態施加
1. 計算機率 `p = chance`。若狀態為減益，且目標與行動者不同隊：`p = chance × (1 + unitStat(行動者, "effectHit")) × (1 − unitStat(目標, "effectRes"))`。
2. `p < 1` 時抽一次 `statusRng.chance(p)`；失敗則加入 `resisted` 事件並結束。`p ≥ 1` 時不抽。
3. 有 `dot` 時：以 `{type:"dot", multiplier:0, element: dot.element}` 對目標建立情境，記錄攻擊方最終統計值為 `snapshot`（只包含傷害規則**宣告**的 attacker 統計值）。
4. 在保距離規則內處理：
   - 已有同 ID 實例：`stacks = min(maxStacks, stacks + 1)`、`turnsLeft = duration`、`sourceUid = 行動者`、有 snapshot 時取代，加入 `refreshed` 事件。
   - 否則：加入 `{stacks:1, turnsLeft: duration}`，加入 `applied` 事件。

### 5.6 造成傷害
1. `hp = max(0, hp − 量)`，加入 `damage` 事件。
2. 若 `hp ≤ 0` 且目標原本存活：
   - `alive = false`，清除所有狀態，加入 `death` 事件；
   - 擊殺者存活且與目標異隊時，擊殺者獲得 `energyOnKill` 能量。

## 6. 敵人 AI
1. 建立 scope：
   - `self.{hpPct, broken, energy, toughnessPct}`
   - `battle.{turn, cycle, allies（存活敵方數）, foes（存活我方數）}`
2. 候選規則 = `weight > 0`、`when` 成立（或省略）、且技能存在者。
3. 有候選時：`roll = aiRng.next() × 總權重`，依序找第一個 `roll < weight` 的規則，否則 `roll −= weight`。都沒有命中時取最後一個。沒有候選時取第一個技能，不抽亂數。
4. 技能 `targeting ≠ "none"` 時：`targeting == "enemy"` 從存活對手、`"ally"` 從存活友方（皆依 slot 排序）以 `aiRng.int(數量)` 選出一個；候選為空時不抽。
5. `self.toughnessPct` 在 `maxToughness = 0` 時為 0。scope 一律以敵方視角命名（AI 只驅動敵方單位）。

## 7. 決策與自動策略
### 7.1 合法行動
1. 決策角色的非大招技能，依技能定義順序列出；若 `spDelta < 0` 且 `sp + spDelta < 0` 則排除。
2. 接著列出大招：存活我方依 slot 排序，每人的大招依技能順序；只列出 `energy ≥ (energyCost ?? maxEnergy)` 者。

### 7.2 提交行動
- **大招**：任何符合條件的我方都可施放。執行後立即 `checkEnd`（成立時照 §4 步驟 1 結束）；否則回到**同一個**決策（若決策角色已死亡，清除決策並繼續主迴圈）。
- **一般行動**：必須是決策角色，且技能點足夠。清除決策後執行，若行動者仍存活則執行回合結束，接著繼續主迴圈。

### 7.3 自動策略（向量使用）
**選擇行動：**
1. `ult == "asap"` 時，取合法清單中的第一個大招。
2. 否則取「戰技」（`type == "skill"` 的第一個合法一般行動）。`skill` 設定：`whenSp`（預設）／`always`／`never`。
   - `skill == "never"` 時不取；
   - 若戰技的效果**全部**是治療、`skill ≠ "always"`，且存活我方的最低血量比例 ≥ 0.7，也不取。
3. 沒有戰技時取「普攻」（`type == "basic"`），再沒有則取第一個合法一般行動。

**選擇目標**（在該技能的候選目標中）：
- 候選為我方時：取血量比例最低者，平手時 slot 小者優先。
- 候選為敵方時，依 `target` 設定：

| target | 規則 |
|---|---|
| first | 第一個 |
| lowestHp | hp 最小（平手時 slot 小者優先） |
| highestHp | hp 最大（平手時 slot 小者優先） |
| weaknessFirst | 先找「弱點含技能元素、未擊破、韌性 > 0」者，取韌性最小（平手時 slot 小者優先）；沒有則同 lowestHp |

## 8. 批量模擬
第 i 場的種子為字串 `` `${seed}#${i}` ``。

## 9. 行動順序預測（predictTimeline）
只看速度、不模擬戰鬥效果，供「速度與行動順序模擬器」使用。輸入：`rules`（avBase、firstCycleAv、cycleAv，向量中明列）、單位清單 `{uid, name, team, slot, spd}`、`cycles`。時間由逐次加上 elapsed 累積（不是 k × fullAv），移植時必須照做。
1. 排除 `spd ≤ 0` 的單位；每個單位 `av = avBase / spd`。`time = 0`；`limit = firstCycleAv + (cycles − 1) × cycleAv`。
2. 重複：依 §4 步驟 2 的排序取下一位；若 `time + next.av ≥ limit` 則停止；否則 `elapsed = next.av`，所有單位 `av −= elapsed`，`time += elapsed`，輸出 `{uid, name, team, time, cycle: cycleAt(time)}`，然後 `next.av = avBase / next.spd`。
（注意：此處 next 的 av 不先設為 0，而是在減去 elapsed 後直接設為完整 av。）沒有任何 `spd > 0` 的單位時回傳空陣列。

## 10. 事件
所有事件都有 `t`（類型）。欄位如下；`time` 為當下累計行動值。

| t | 欄位 | 何時 |
|---|---|---|
| cycle | cycle, time | 建立時一次（cycle 1, time 0）；之後每進入新的一輪 |
| turn | uid, time | 每個回合開始 |
| recover | uid | 擊破狀態在自己回合開始時恢復 |
| skip | uid, reason（狀態名稱） | 控制狀態跳過行動 |
| action | uid, skillId, skillName, skillType, targetUid（有指定時）, time | 每次執行技能 |
| damage | src, dst, amount, crit, kind（hit／break／dot）, hpAfter, skillId（僅 hit） | 每次造成傷害（含 0） |
| toughness | dst, before, after | 削韌實際發生時 |
| break | src, dst | 擊破 |
| heal | src, dst, amount（實際回復量，可為 0） | 每次治療效果 |
| status | src, dst, statusId, result（applied／refreshed／resisted／expired） | 施加結果；到期時 src 為實例的 sourceUid |
| energy | uid, before, after | 能量**有變化**時（大招會有歸零與獲得兩筆） |
| sp | before, after | 我方行動且 spDelta ≠ 0 時（即使夾限後數值不變） |
| advance | uid, before, after | 推進效果或擊破延後（一律記錄） |
| death | uid, by | 單位倒下；其狀態直接清除，不產生 expired |
| end | result, time | 戰鬥結束；timeout 時 time 為未推進前的時間 |

## 11. 單位狀態（向量 `units`）
`uid, defId, name, team, slot, element, base（= stats 複本）, weaknesses, hp, maxHp, energy, maxEnergy, toughness, maxToughness, broken, alive, av, statuses[{statusId, sourceUid, stacks, turnsLeft, snapshot?}]`
