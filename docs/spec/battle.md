# 回合戰鬥規格

規則版本 0.8.0（§13 擴充機制、§14 觸發對象、支配與行動條事件、§15 條件式修正、受控判負與依目標生命的傷害）。

戰鬥直接使用專案的傷害規則（damage.md）計算每段命中。所有狀態都是純 JSON；給定（設定, 種子, 行動序列）結果完全確定。

## 1. 設定
- `rules`：`avBase`、`firstCycleAv`、`cycleAv`、`spStart`、`spMax`、`energyOnHitTaken`、`energyOnKill`、`breakDelay`、`breakDamage`（表示式）、`maxCycles`、`rounding`、`maxFieldUnits`（選填，預設 5，§13.5）。
- `units`：單位定義（`id`、`name`、`team`、`element`、`stats`、`weaknesses`、`skills`、`ai`、`passives`；擴充欄位 `elementRes`、`statusRes`、`phases`、`boundToSummoner` 見 §13，`timelineEvent` 見 §14.4；`source` 只供介面顯示，引擎不讀）。
- `statuses`：狀態定義。
- `encounter`：`allies`、`enemies` 兩個單位 ID 陣列（可重複）。
- `damage`：由專案 `damage.config` 經 damage.md §3 組合出的傷害規則。

## 2. 建立戰鬥
1. 依 `allies` 再 `enemies` 的順序建立單位：`uid` = `A<i+1>`／`E<i+1>`，`slot` = i。
2. `hp = maxHp = stats.hp ?? 1`；`energy = stats.startEnergy ?? 0`；`maxEnergy = stats.maxEnergy ?? 0`；`toughness = maxToughness = stats.toughness ?? 0`；`broken = false`；`statuses = []`；`passiveUses = {}`；`phase = 1`；`counters = {}`。
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
狀態修正有 `target`、`op`、`value`、`role`，以及選填的 `when`、`scaleBy`（§15.1）；沒有 `enabled`。
對每個狀態實例（列表順序）的每個修正（定義順序）：
- 有 `when` 或 `scaleBy` 的修正只在傷害情境（§3.4、§4 步驟 7、§5.3、§5.5、§13.10）中存在，依 §15.1 先決定是否套用與倍數 k；用於 §3.1 時一律略過。
- 數值：`add`／`pct` 為 `(value × stacks) × k`（沒有 scaleBy 時 k = 1，即 `value × stacks`）；`mul` 為 `value ^ stacks`；`override` 為 `value`。
- `stat:<key>`：
  - 持有者是攻擊方時，轉為 `stat:attacker.<key>`；
  - 持有者是防守方時，轉為 `stat:defender.<key>`；
  - 用於 §3.1 時保持 `stat:<key>`。
- `step:<id>`：`role` 省略時為 `outgoing`。持有者攻擊時只取 `outgoing`，被攻擊時只取 `incoming`。

### 3.4 傷害情境
**元素**：技能命中與削韌使用 `skill.element ?? 行動者.element`；持續傷害使用 `dot.element`。

攻擊方 X 打防守方 Y 時，damage.md 的情境為：
- `attacker = X.stats`、`defender = Y.stats`。
- 若 Y 的定義有 `elementRes[element]`，`defender` 改用 `{...Y.stats, res: elementRes[element]}`（§13.1）。
- `flags = { broken: Y.broken, weakness: Y.weaknesses 包含 element }`。
- `modifiers = X 的攻擊方修正 ++ Y 的防守方修正`。

## 4. 主迴圈
重複執行：
1. 若已結束，或 `checkEnd` 成立，則停止。`checkEnd`：
   - 敵方落敗 → `win`；否則我方落敗 → `lose`。一隊**落敗**＝沒有存活的戰鬥單位（不含事件單位，§14.4），或存活的戰鬥單位全員都帶有 `defeatIfAll` 狀態（§15.2，此時 `end` 事件加上 `reason: "disabled"`）；
   - 成立時加入 `end` 事件、清除決策。
2. **下一位行動者**：存活單位依下列順序排序，取第一個：
   - `av` 小者優先；
   - 平手時，同隊比 `slot`，異隊我方優先。
   - 比較使用**精確浮點值**。移植版本必須用相同的運算順序更新 av，平手判定才會一致。
3. `elapsed = next.av`，`newTime = time + elapsed`，`newCycle = cycleAt(newTime)`。若 `newCycle > maxCycles`，以 `timeout` 結束，且**不**更新時間。
   - `cycleAt(t) = t < firstCycleAv ? 1 : 2 + floor((t − firstCycleAv) / cycleAv)`
4. 所有存活單位 `av −= elapsed`，然後 `next.av = 0`，`time = newTime`。cycle 每增加 1 就加入一個 `cycle` 事件。
5. `turns += 1`，加入 `turn` 事件，並清空行動者的 `passiveUses`。
6. 若 `next.broken`：設 `broken = false`、`toughness = maxToughness`，加入 `recover` 事件。
7. **持續傷害**：依狀態列表順序（迭代開始時的副本）處理每個有 `dot` 的實例（持有者需存活）：
   - 攻擊方數值 = 該實例的 `snapshot`；修正值**只有**持有者作為防守方的修正（§3.3），沒有攻擊方修正；
   - 技能 = `{type:"dot", element: dot.element, multiplier: dot.multiplier × stacks, hits:[1]}`；
   - 第 0 段、不暴擊；
   - 以 `kind:"dot"`、來源 `sourceUid` 造成傷害（§5.6）。
8. 若行動者已死亡，回到步驟 1；若 `checkEnd` 成立，停止。
9. 若有任一 `skipTurn` 狀態：以第一個這種狀態的名稱加入 `skip` 事件，執行回合結束（§4.1），回到步驟 1。
10. 若有任一 `charm` 狀態：以第一個這種狀態的名稱加入 `charm` 事件（§14.3）。
11. 我方、未被支配、且不是事件單位：設定決策 `{actorUid}` 並等待輸入。其他（敵方、被支配者、事件單位）：依 §6 決定行動並執行（§5），處理被動觸發（§12）；若 `checkEnd` 成立則停止（**不執行**回合結束）；否則若仍存活，執行回合結束。

### 4.1 回合結束
在保距離規則內：
1. 所有 `duration > 0` 的狀態 `turnsLeft −= 1`（`duration == 0` 為永久，§13.2，不扣也不到期）；
2. 移除 `duration > 0` 且 `turnsLeft ≤ 0` 者，依列表順序加入 `expired` 事件。

最後 `av = fullAv(u)`。

## 5. 執行技能
1. 加入 `action` 事件。
2. 行動者為我方、未被支配（§14.3）且 `spDelta ≠ 0`：`sp = clamp(sp + spDelta, 0, spMax)`，加入 `sp` 事件。
3. 大招：`energy = 0`。接著 `energy = energy + energyGain`。能量一律限制在 [0, maxEnergy]；有變化才加入 `energy` 事件。
4. 依序處理每個效果。`summon`／`dismiss`／`sp` 沒有目標，每個效果只執行一次（§13.5、§13.9）。其他效果先決定目標（§5.1），依「主目標，再相鄰目標」的順序，對每個存活目標套用效果。傷害效果套用到對手（套用前存活即可，即使被打死）後，將其記入本行動的「被擊中集合」（保持插入順序）。
5. 所有效果結束後，被擊中集合中存活的我方單位各加 `energyOnHitTaken` 能量。

### 5.1 目標
存活對手與存活友方各依 slot 排序，兩者都**不含事件單位**（§14.4）；被支配的行動者兩者互換（§14.3）。`chosen` 為行動指定的 uid。

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
   - 元素不在目標弱點中；
   - 目標有任何 `toughnessLock` 狀態（§13.2）。
2. `toughness = max(0, toughness − 量)`，加入 `toughness` 事件。仍大於 0 則結束。
3. 歸零時：`broken = true`，加入 `break` 事件。
4. 擊破傷害：以 `{type:"skill", multiplier:0, hits:[1], element}` 建立情境（此時 `broken` 已為 true），解出最終統計值。
   - scope：
     - `attacker = {...行動者.stats, ...攻擊方最終值, breakEffect: unitStat(行動者, "breakEffect")}`
     - `defender = {...目標.stats, ...防守方最終值, maxToughness}`
   - 傷害量 = `rounding(max(0, breakDamage))`，以 `kind:"break"` 造成傷害。
5. 若目標仍存活：`av += fullAv(目標) × breakDelay`，加入 `advance` 事件；接著解除目標施加的 `release == "sourceBreak"` 狀態（§13.7）。

### 5.4 治療、能量、推進
- **治療**：`base = scale == "atk" ? unitStat(行動者, "atk") : 目標.maxHp`；`量 = rounding((base × multiplier + flat) × (1 + unitStat(行動者, "healBonus")) × (1 + unitStat(目標, "healTaken")))`（兩個統計值未宣告時為 0）；`hp = min(maxHp, hp + 量)`；事件記實際回復量。
- **推進**：`av = max(0, av − fullAv(目標) × amount)`。
- **能量**：`energy + amount`，限制在 [0, maxEnergy]。

### 5.5 狀態施加
1. 計算機率 `p = chance`。若狀態為減益，且目標與行動者不同隊：`p = chance × (1 + unitStat(行動者, "effectHit")) × (1 − unitStat(目標, "effectRes"))`；若狀態有 `category` 且目標定義的 `statusRes` 有該鍵 r，再 `p = p × (1 − r)`（沒有該鍵時不乘，§13.1）。
2. `p < 1` 時抽一次 `statusRng.chance(p)`；失敗則加入 `resisted` 事件並結束。`p ≥ 1` 時不抽。
3. 有 `dot` 時：以 `{type:"dot", multiplier:0, element: dot.element}` 對目標建立情境，記錄攻擊方最終統計值為 `snapshot`（只包含傷害規則**宣告**的 attacker 統計值）。有 `shield` 時：`shield = rounding(scaleValue(行動者, shield.scale) × multiplier + flat)`（§13.4）。
4. 在保距離規則內處理：
   - 已有同 ID 實例：`stacks = min(maxStacks, stacks + 1)`、`turnsLeft = duration`、`sourceUid = 行動者`、有 snapshot 時取代、有 shield 時 `shield = max(原剩餘, 新值)`，加入 `refreshed` 事件。
   - 否則：加入 `{stacks:1, turnsLeft: duration}`（有 snapshot／shield 時一併記錄），加入 `applied` 事件。

### 5.6 造成傷害
1. **護盾**：`rest = 量`；依狀態列表順序，對 `shield > 0` 的實例：`a = min(shield, rest)`，`shield −= a`、`rest −= a`、`absorbed += a`。
2. `hp = max(0, hp − rest)`，加入 `damage` 事件（`amount` 為原本的量；`absorbed > 0` 時加上 `absorbed` 欄位）。
3. 若 `hp ≤ 0` 且目標原本存活，依序檢查：
   1. **復活**：狀態列表中第一個定義有 `revive` 的實例。若有：在保距離規則內移除它，`hp = max(1, rounding(maxHp × hpPct))`，加入 `revive` 事件，結束。
   2. **階段**：定義的 `phases` 長度 ≥ `phase` 時進入下一階段（§13.6），結束。
   3. **死亡**：`alive = false`，清除所有狀態，加入 `death` 事件；擊殺者存活且與目標異隊時，擊殺者獲得 `energyOnKill` 能量；然後執行離場處理（§13.7）。

## 6. AI（敵人、被支配者、事件單位）
1. 建立 scope：
   - `self.{hpPct, broken, energy, toughnessPct, phase, shield, av, rank}`（shield 為所有實例剩餘護盾總和；av、rank 見 §14.1）
   - `self.counter.<key>`（沒有時為 0）、`self.status.<statusId>`（層數，沒有時為 0）
   - `battle.{turn, cycle, allies, foes}`、`battle.count.<角色 ID>`（§14.1）
   - `target.*`：只有被動條件有觸發對象（§14.1）；AI 規則一律為「無對象」
2. 若 `nextSkill` 有值：先清除它；若該技能存在，直接使用它，**不**抽 AI 規則亂數（跳到步驟 4）。
   候選規則 = `weight > 0`、`when` 成立（或省略）、且技能存在者。
3. 有候選時：`roll = aiRng.next() × 總權重`，依序找第一個 `roll < weight` 的規則，否則 `roll −= weight`。都沒有命中時取最後一個。沒有候選時取第一個技能，不抽亂數。
4. 技能 `targeting ≠ "none"` 時：`targeting == "enemy"` 從存活對手、`"ally"` 從存活友方（§5.1 的列表：依 slot 排序、不含事件單位、被支配時互換）選出一個；候選為空時不抽。
   - `"ally"`，或所有候選的 `w = max(0, unitStat(候選, "taunt"))` 都相等：`aiRng.int(數量)`。
   - 否則（嘲諷加權，§13.3）：`roll = aiRng.next() × Σw`；依序略過 `w = 0` 者，第一個 `roll < w` 的候選中選，否則 `roll −= w`；都沒中時取最後一個 `w > 0` 者。
5. `self.toughnessPct` 在 `maxToughness = 0` 時為 0。`battle.allies` 是與 self **同隊**的存活戰鬥單位數，`battle.foes` 是另一隊的存活戰鬥單位數（皆不含事件單位，也不受支配影響）（AI 與 §12 被動條件共用此 scope）。

## 7. 決策與自動策略
### 7.1 合法行動
1. 決策角色的技能，依技能定義順序列出，排除 `ultimate`、`followup`、`dot` 類型；若 `spDelta < 0` 且 `sp + spDelta < 0` 則排除。
2. 接著列出大招：存活我方依 slot 排序（排除被支配者與事件單位，§14），每人的大招依技能順序；只列出 `energy ≥ (energyCost ?? maxEnergy)` 者。

### 7.2 提交行動
- **大招**：任何符合條件的我方都可施放。執行後處理被動觸發（§12），然後立即 `checkEnd`（成立時照 §4 步驟 1 結束）；否則回到**同一個**決策（若決策角色已死亡，清除決策並繼續主迴圈）。
- **一般行動**：必須是決策角色，不可為大招／追加攻擊／dot 類型，且技能點足夠。清除決策後執行，處理被動觸發（§12）；若 `checkEnd` 成立則停止（不執行回合結束）；否則若行動者仍存活則執行回合結束，接著繼續主迴圈。

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
| charm | uid, reason（狀態名稱） | 被支配者的回合，緊接在其 action 之前（§14.3） |
| action | uid, skillId, skillName, skillType, targetUid（有指定時）, time | 每次執行技能（含追加攻擊） |
| trigger | uid, passiveId, passiveName, targetUid（有時） | 被動即將執行追加攻擊（緊接在其 action 之前） |
| damage | src, dst, amount, crit, kind（hit／break／dot）, hpAfter, skillId（僅 hit）, absorbed（僅護盾吸收 > 0 時） | 每次造成傷害（含 0） |
| toughness | dst, before, after | 削韌實際發生時 |
| break | src, dst | 擊破 |
| heal | src, dst, amount（實際回復量，可為 0） | 每次治療效果 |
| status | src, dst, statusId, result（applied／refreshed／resisted／expired／dispelled／released） | 施加結果；到期時 src 為實例的 sourceUid；dispelled 的 src 為驅散者（階段清除減益時為本人）；released 的 src 為離場或被擊破的施加者 |
| energy | uid, before, after | 能量**有變化**時（大招會有歸零與獲得兩筆） |
| sp | before, after | 我方行動且 spDelta ≠ 0 時，或 `sp` 效果（即使夾限後數值不變） |
| advance | uid, before, after | 推進效果或擊破延後（一律記錄） |
| death | uid, by | 單位倒下；其狀態直接清除，不產生 expired |
| revive | uid, statusId, hp | 復活狀態抵銷致命傷（§5.6） |
| phase | uid, phase（進入後的階段，從 2 起）, name | 進入下一階段（§13.6） |
| summon | uid, defId, by | 召喚出新單位（§13.5） |
| dismiss | uid, by | 單位被移除（非擊殺；§13.5） |
| counter | uid, key, before, after | 計數器**有變化**時（§13.9） |
| queue | uid, skillId | 指定下一次行動（§13.8） |
| end | result, time, reason?（`"disabled"`，§15.2） | 戰鬥結束；timeout 時 time 為未推進前的時間 |

## 11. 單位狀態（向量 `units`）
`uid, defId, name, team, slot, element, base（= stats 複本）, weaknesses, hp, maxHp, energy, maxEnergy, toughness, maxToughness, broken, alive, av, statuses[{statusId, sourceUid, stacks, turnsLeft, snapshot?, shield?}], passiveUses{passiveId: 次數}, phase, counters{key: 值}, nextSkill?, summonedBy?, timelineEvent?`（timelineEvent 只在定義為事件單位時出現，值為 true）

召喚出的單位接在 `units` 陣列尾端；`units` 從不移除單位（倒下或移除只設 `alive = false`）。

## 12. 被動與追加攻擊
單位定義可有 `passives: [{id, name, on, skillId, when?, limitPerTurn}]`。被動在**每個頂層行動**（我方一般行動、大招、敵方行動）執行完畢後處理；持續傷害與回合開始的事件不觸發被動。

### 12.1 觸發比對
從該行動的第一個事件開始，依事件順序掃描。對每個事件，依「存活我方依 slot、再存活敵方依 slot」的順序檢查每個單位（**存活與否以掃描當下為準**，不是事件發生當下），再依被動定義順序比對。事件中 src／by／dst 的隊伍一律依該單位所屬隊伍判斷，即使它已死亡：

| on | 事件條件 | 追加攻擊的 chosen |
|---|---|---|
| allyUltimate | `action`，skillType 為 ultimate，行動者與持有者同隊（含自己） | 該 action 的 targetUid |
| allyBreak | `break`，src 與持有者同隊 | 被擊破者（dst） |
| selfHit | `damage`，kind 為 hit，dst 是持有者，src 與持有者異隊（**每個 damage 事件各比對一次**） | 攻擊者（src） |
| enemyKilled | `death`，by 與持有者同隊、死者與持有者異隊 | 無（使用 §5.1 預設） |
| foeAction | `action`，行動者與持有者異隊，且（有 `skillTypes` 時）skillType 在其中 | 該行動者（uid） |
| phaseChange | `phase`，uid 是持有者 | 無 |
| counterChange | `counter`，uid 是持有者 | 無 |
| allyHit | `damage`，kind 為 hit，src 與持有者同隊（含自己）、dst 與持有者異隊（**每個 damage 事件各比對一次**，§14.2） | 被命中者（dst） |

`dismiss` 不是 `death`，不會觸發 enemyKilled。

`allyUltimate` 的大招若沒有指定目標，chosen 為無。

比對成立後：
1. 若 `limitPerTurn > 0` 且 `passiveUses[id] ≥ limitPerTurn` 則略過。
2. 若有 `when` 且以持有者的 §6 scope（`target.*` 為該觸發的對象，§14.1）求值為假則略過。
3. 否則 `passiveUses[id] += 1`（**入列時**就計數），加入佇列尾端 `{uid, passiveId, chosen}`。

### 12.2 執行佇列
最多執行 20 個追加攻擊（每個頂層行動，含連鎖）：
1. 每次取出前都先 `checkEnd`；成立則停止（剩餘佇列丟棄）。頂層行動本身已分出勝負時，第一次檢查就會結束，`end` 事件只會有一個。
2. 從佇列頭取出（每次取出都計入 20 次額度）；持有者已死亡則略過，其 `passiveUses` 不退回。
3. 加入 `trigger` 事件，依 §5 執行該技能（chosen 照上表；chosen 已死亡時其 `action` 事件仍記錄該 targetUid，依 §5.1 目標為空），然後從該技能的第一個事件起依 §12.1 掃描並入列（可連鎖）。

`skillId` 不存在於持有者時為錯誤（實作丟出例外；驗證器會事先標示）。

**「每回合」的意義**：`passiveUses` 只在持有者**自己的**回合開始時清空，也就是「兩次自己行動之間」最多觸發 limitPerTurn 次。

追加攻擊照常套用技能的 spDelta（我方）與 energyGain。

## 13. 擴充機制（規則 v0.6）

以下欄位全部選填；省略時行為與 v0.5 完全相同（既有向量的事件逐筆不變）。這些是本工具的通用機制，不是任何特定遊戲的規則。

### 13.1 抗性
- **屬性抗性** `UnitDef.elementRes: {element: 值}`：該元素的傷害情境中，防守方基礎 `res` 改為此值（§3.4）。包含持續傷害、引爆與擊破傷害情境。只有在傷害規則宣告了 `defender.res` 時才有作用。
- **狀態抵抗** `UnitDef.statusRes: {category: 值}` 配合 `StatusDef.category`：只影響異隊施加的減益機率（§5.5 第 1 步）。

### 13.2 狀態旗標
| 欄位 | 規則 |
|---|---|
| `duration: 0` | 永久：施加時 `turnsLeft = 0`，回合結束不扣、不到期（§4.1）。仍可被驅散、解除或隨死亡清除 |
| `toughnessLock` | 持有者無法被削韌（§5.3） |
| `dispellable: false` | 不受驅散效果影響（預設可驅散） |
| `shield` | 見 §13.4、§5.5、§5.6 |
| `revive: {hpPct}` | 見 §5.6；0 < hpPct ≤ 1 |
| `release` | 見 §13.7 |

### 13.3 嘲諷
統計值 `taunt`（以 unitStat 取得，可被狀態修正）只影響敵人 AI 選擇**對手**目標（§6 第 4 步）。全部相等（包含都沒有設定）時與 v0.5 相同，亂數用量不變。

### 13.4 數值依據 `scaleValue(u, scale)`
`scale == "hp"` 時為 `u.maxHp`；`"atk"`／`"def"` 時為 `unitStat(u, scale)`。
- **傷害效果** `scale`：省略或 `"atk"` 時照舊。否則每段命中的攻擊方為 `base = {...行動者.stats, atk: scaleValue(行動者, scale)}`（`targetMaxHp`／`targetHp` 改用目標的數值，§15.3），修正值為攻擊方修正**去掉**目標為 `stat:attacker.atk` 的項目（傷害公式仍讀 `attacker.atk`）。
- **護盾** `StatusDef.shield = {scale, multiplier, flat}`：以施加者計算（§5.5）。

### 13.5 召喚與移除
- **summon** `{unitId, count}`：重複 count 次：若召喚的不是事件單位、且行動者隊伍的存活戰鬥單位數（不含事件單位，§14.4）≥ `maxFieldUnits ?? 5` 則停止；否則以 §2 第 2 步建立單位，`team` = 行動者隊伍（定義必須同隊，否則為錯誤），`uid = 前綴 + (該隊在 units 中的總數 + 1)`（含已倒下者），`slot = 該隊最大 slot + 1`，`summonedBy = 行動者 uid`，`av = fullAv`，接在 `units` 尾端，加入 `summon` 事件。新單位立即可被同一技能後續的效果選為目標（事件單位除外）。
- **dismiss** `{unitId?}`：有 unitId 時，行動者隊伍中所有存活且 defId 相同者（依 units 順序）；沒有時為行動者自己。每個：`alive = false`、清除狀態、加入 `dismiss` 事件（by = 行動者），然後離場處理（§13.7）。不給擊殺能量、不觸發 enemyKilled。
- 隊伍全數倒下或被移除時照常結束戰鬥（§4 步驟 1）。

### 13.6 階段
`UnitDef.phases: [{name, stats?, weaknesses?, clearDebuffs?}]`，第 k 個元素是第 k + 1 階段。致命傷害且 `phase ≤ phases.length` 時（§5.6）：
1. `phase += 1`，加入 `phase` 事件。
2. 在保距離規則內：`base = {...base, ...stats}`；有 `weaknesses` 時取代；`clearDebuffs` 時移除全部減益，依列表順序加入 `dispelled` 事件（src = dst = 本人）。
3. `maxHp = base.hp ?? maxHp`、`hp = maxHp`；`maxToughness = base.toughness ?? maxToughness`、`toughness = maxToughness`、`broken = false`。
多出的傷害不轉移。同一段命中之後的段數照常打在新階段上。

### 13.7 驅散、解除與離場處理
- **dispel** `{statusKind, count}`：目標狀態中 `kind == statusKind` 且可驅散者，取列表中**最後** count 個（count ≤ 0 為全部），從最後一個往前，在保距離規則內移除並各加入 `dispelled` 事件（src = 行動者）。
- **解除** `StatusDef.release`：`"sourceDeath"` 在施加者（實例的 sourceUid）離場時解除；`"sourceBreak"` 在施加者被擊破（§5.3 第 5 步）或離場時解除。對每個存活單位（我方依 slot、再敵方依 slot），在保距離規則內移除符合者，依列表順序加入 `released` 事件（src = 施加者）。
- **離場處理**（死亡或移除後）：先解除該單位施加的 sourceDeath／sourceBreak 狀態；然後對每個存活單位（units 順序）中 `summonedBy` 是它、且定義有 `boundToSummoner` 者執行移除（by = 它，可遞迴）。

### 13.8 指定下一次行動
**queueSkill** `{target, skillId}`：目標的定義有此技能時設 `nextSkill = skillId` 並加入 `queue` 事件，否則無效果。只有敵人 AI 會讀取（§6 第 2 步）；與 `advance`（amount 1）搭配即為「立刻插隊行動」。

### 13.9 計數器與技能點
- **counter** `{target, key, op: "add"|"set", value}`：`before = counters[key] ?? 0`；`after = add ? before + value : value`；不同時寫入並加入 `counter` 事件。
- **sp** `{amount}`：`sp = clamp(sp + amount, 0, spMax)`，一律加入 `sp` 事件。不論行動者隊伍，都作用於我方共用技能點。

### 13.10 引爆持續傷害
**detonate** `{target, ratio, statusId?}`：依目標狀態列表（迭代開始時的副本）順序，對每個有 `dot`（且 statusId 相符，若有指定）的實例、目標仍存活時，以 §4 步驟 7 的方式計算一跳，但倍率為 `dot.multiplier × stacks × ratio`，以 `kind:"dot"`、來源為實例的 sourceUid 造成傷害。不改變狀態的回合數或層數。

### 13.11 條件可用的變數
AI 與被動條件可用：§6 的固定變數、`self.phase`、`self.shield`、`self.counter.<識別字>`、`self.status.<狀態 ID>`（狀態必須存在，否則驗證錯誤）。v0.7 新增的變數見 §14.1。

## 14. 觸發對象、支配與行動條事件（規則 v0.7）

以下欄位與變數全部選填；不使用時行為與 v0.6 完全相同（既有向量的事件逐筆不變）。

### 14.1 條件變數
**單位變數**（`self.*` 與 `target.*` 共用）：`hpPct, broken, energy, toughnessPct, phase, shield`（§6）、`counter.<識別字>`、`status.<狀態 ID>`，以及：
- `av`：單位目前剩餘的行動值。
- `rank`：存活單位（**含**事件單位）依 §4 步驟 2 排序後，排在它前面的單位數；0 表示它是下一個行動者。單位已不存活時為 −1。求值當下計算（敵人 AI 在自己回合求值時，自己的 av 為 0）。

**觸發對象** `target.*`：只有被動條件（§12.1 第 2 步）有，依觸發種類：

| on | 對象 |
|---|---|
| allyUltimate | 大招的 targetUid（沒有時為無對象） |
| allyBreak | 被擊破者 |
| selfHit | 攻擊者 |
| enemyKilled | 倒下的單位（此時已不存活：`hpPct` 0、`rank` −1、狀態已清除） |
| foeAction | 行動者 |
| allyHit | 被命中者 |
| phaseChange、counterChange | 無對象 |

- `target.exists`：有對象為真；`target.isFoe`：對象與持有者**異隊**（依原本隊伍，不受支配影響）。
- 無對象時（含所有 AI 規則）：`exists`、`isFoe`、`broken` 為假，`rank` 為 −1，其他數值與 `counter.*`、`status.*` 為 0。
- 對象 uid 不存在於 `units` 時視為無對象。

**場上數量** `battle.count.<角色 ID>`：存活且 `defId` 相同的單位數（不分隊伍、**含**事件單位）。角色 ID 必須存在，否則驗證錯誤。

驗證：AI 規則條件使用 `target.*` 為錯誤；`target.status.<ID>` 的狀態必須存在。

### 14.2 隊友命中觸發
`allyHit` 見 §12.1。與 `selfHit` 一樣每段命中比對一次，建議設定 `limitPerTurn`（為 0 時驗證器提醒）。追加攻擊造成的命中同樣會被掃描，所以會自己連鎖到次數上限為止。

### 14.3 支配
`StatusDef.charm: true`。持有者有任何 charm 狀態時（`skipTurn` 先檢查，同時有時以無法行動為準）：
1. **回合**：§4 步驟 10 加入 `charm` 事件；無論隊伍都依 §6 由 AI 行動（沒有 AI 規則時取第一個技能），不產生決策。
2. **敵我互換**：§5.1 與 §6 第 4 步中，持有者的「對手」為**自己隊伍中除自己以外**的存活戰鬥單位，「友方」為另一隊的存活戰鬥單位（皆依 slot 排序）。`self` 模式不變。這也適用於持有者在支配期間施放的追加攻擊。
3. **技能點**：持有者施放技能時忽略 `spDelta`（§5 步驟 2）。`sp` 效果照常作用。
4. **大招**：被支配的我方不會出現在 §7.1 大招清單，提交也會被拒絕。
5. **其他規則仍依原本隊伍**：減益機率（§5.5，同隊不套用命中／抵抗）、受擊能量（§5 步驟 5，只給被異隊擊中的我方）、擊殺能量、被動觸發的隊伍比對、`battle.allies／foes`。
支配通常設為 `duration: 1`：持有者行動完的回合結束時到期。

### 14.4 行動條事件
`UnitDef.timelineEvent: true` 的單位（事件單位；建立時在單位狀態記錄 `timelineEvent: true`）：
- 照速度在行動條上排序、取得回合、處理持續傷害與狀態回合數，與一般單位相同。
- **一律**依 §6 由 AI 行動（我方的事件單位也不產生決策），不能施放大招（§7.1 排除）。
- 不在任何目標列表中（§5.1、§6 第 4 步、§7.3），因此不會被攻擊、治療或施加狀態；只能用 `self` 模式影響自己，或被 `dismiss`／召喚者離場（`boundToSummoner`）移除。
- 不計入勝負（§4 步驟 1）、`battle.allies／foes` 與召喚人數上限；召喚事件單位不受上限限制（§13.5）。
- 計入 `battle.count.*` 與 `rank`。

## 15. 條件式修正、受控判負、依目標生命的傷害（規則 v0.8）

以下欄位全部選填；不使用時行為與 v0.7 完全相同（既有向量的事件逐筆不變）。

### 15.1 條件式狀態修正
`StatusModifier.when`（布林表示式）與 `scaleBy`（數值表示式）。
- **作用範圍**：只在建立傷害情境時：技能命中（§5.2）、持續傷害一跳與引爆（§4 步驟 7、§13.10）、擊破傷害（§5.3）、持續傷害快照（§5.5）。§3.1 的 `unitStat`（速度、效果命中、嘲諷、治療加成、護盾依據等）**一律略過**這種修正，因此不影響保距離規則。
- **scope**：被動條件的 scope（§6、§14.1），`self` 為持有者，`target` 為這次傷害的另一方：持有者是攻擊方時為防守方；持有者是防守方時為攻擊方（持續傷害為實例的 sourceUid 對應單位，不存在時為無對象）。持續傷害快照時，`target` 為被施加者。
- **求值**：每個持有者在每次建立情境時最多建立一次 scope（scope 內容在同一次建立中不變）。先求 `when`，為假則該修正不存在；再求 `scaleBy` 得 k。
- `scaleBy` 只對 `add`／`pct` 有效（數值 = `(value × stacks) × k`）；用在 `mul`／`override` 為驗證錯誤，引擎忽略它（k = 1）。
- 目標為 `stat:<key>` 而 key 不是傷害規則宣告的數值時，驗證器提醒「不會有效果」。

### 15.2 受控判負
`StatusDef.defeatIfAll: true`。§4 步驟 1 的 `checkEnd` 中，一隊存活的戰鬥單位**全員**都至少帶有一個 defeatIfAll 狀態時，該隊落敗；敵方先判（勝利優先）。`checkEnd` 在所有既有時機檢查（主迴圈、每個頂層行動後、每個追加攻擊取出前），所以狀態施加完、該行動結束時就會判定。事件單位不計入。

### 15.3 依目標生命的傷害
傷害效果 `scale` 可為 `"targetMaxHp"` 或 `"targetHp"`：每段命中建立情境時，攻擊方 `atk` 取目標的 `maxHp`／目前 `hp`（該段命中**之前**的值），並照 §13.4 去掉攻擊方 `stat:attacker.atk` 修正。其他乘區（防禦、抗性、暴擊等）照常計算。護盾的 `scale` 不接受這兩個值。
