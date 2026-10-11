# 反應判定規格 1.0（格擋、閃避與自訂互動）

規則版本 1.0.0。實作：`packages/core/src/timing/`（`@gml/core` 匯出為命名空間 `Timing`）。向量：`packages/core/vectors/timing.json`。型別：`timing/types.ts`。

動作遊戲裡「在特定幾幀內按下按鍵」的判定。**格擋和閃避不是寫死的規則**，只是兩筆內建的互動資料；使用者可以新增互動，定義它的判定窗、對每種攻擊標籤的結果，以及結果帶來的效果。

## 1. 時間
- 所有時間都是**整數幀**。幀號 `t = 0, 1, 2, …`，`stepTiming` 每次處理一幀。
- `fps` 只用來顯示和換算毫秒：`msToFrames(ms, fps) = roundHalfAway(ms × fps / 1000)`，`framesToMs(f, fps) = f × 1000 / fps`。
- 頓幀（hitstop）和慢動作（timeScale）是**宿主指令**：核心只記錄，不改變狀態。宿主在頓幀期間不推進遊戲時間（也不呼叫 `stepTiming`），所以核心的幀號一律是「遊戲內時間」。
- 區間 `[from, to)` 一律不含右端點。

## 2. 資料（`TimingConfig`）
`version: 1`、`id`、`name`、`description?`、`fps`、`inputOffset`、`tags`、`resources`、`statuses`、`outcomes`、`interactions`、`hitOutcome`、`healthResource`。

| 欄位 | 意義 |
|---|---|
| `tags[]` | 攻擊標籤 `{id, name, color?}`，例如子彈、不可格擋、突刺、掃腿 |
| `resources[]` | 數值池 `{id, name, max, initial}`，例如 hp（生命）、gauge（技能量表）。值永遠夾在 `[0, max]` |
| `statuses[]` | 具名計時狀態 `{id, name}`，由 `status` 效果設定（例如反擊窗）。`invulnerable`（無敵）是內建狀態，不必宣告 |
| `outcomes[]` | 結果 `{id, name, kind, color?, effects[]}`。`kind` ∈ perfect／success／fail／neutral，只用於顯示與統計 |
| `interactions[]` | 互動（§4） |
| `hitOutcome` | 攻擊沒被任何互動攔截、也沒被無敵擋下時套用的結果 |
| `healthResource` | `damage` 效果扣的資源；歸零時觸發 `defeated` |
| `inputOffset` | 延遲校正（§4.6） |

### 2.1 攻擊 `AttackEvent`
`{id, frame, tags[], damage?}`：`frame` 是命中幀，`damage` 預設 1。多段攻擊就是多筆事件。

## 3. 效果詞彙（`EffectDef`）
每個效果可以有 `when?: Expr`，求值為假時跳過。數值欄位都是 `Expr`，在 §5 的變數範圍內求值。代表幀數的欄位取 `max(0, roundHalfAway(值))`。在幀 `t` 套用。

| type | 欄位 | 效果 |
|---|---|---|
| `damage` | amount | `healthResource -= max(0, amount)`（夾到 0）。歸零且尚未 defeated 時：`defeated = true`，在這個 effect 事件**之後**發出 `defeated` 事件 |
| `addResource` | resource, amount | 資源加上 amount（可為負），夾在 `[0, max]` |
| `invulnerable` | frames n | 無敵狀態結束幀 = `max(原結束幀, t + n)`。**包含當前幀**，所以同一幀稍後結算的攻擊也會被擋 |
| `status` | status, frames n | 同上，套用在具名狀態 |
| `stun` | frames n | n > 0 時：**中斷目前動作**（動作清空，發出 `phase idle`），`stunUntil = max(stunUntil, t + n)` |
| `restoreCharge` | interaction, amount n | 該互動的充能 +n，不超過上限。sequential：充滿時清掉計時；parallel：移除最晚到期的 n 個計時 |
| `cancelRecovery` | — | 目前動作立刻結束（清空，發出 `phase idle`）。輸入已在本幀先處理過，所以實際上從 `t + 1` 起可以再行動 |
| `hitstop` | frames | 宿主指令：凍結畫面 n 幀 |
| `timeScale` | scale, frames | 宿主指令：以 scale 倍速播放 n 幀（真實時間的幀） |
| `cue` | cue, value? | 宿主指令：任意具名訊號，例如 `reflect`（反彈投射物）、`pass`（攻擊穿過角色、不被消除，閃避類結果使用；沒有 `pass` 的攔截結果視為攻擊被消除）、`attackerStagger`、`knockback`、`vfx:<名稱>`、`anim:<狀態>` |

效果依列表順序**逐一**套用；後面的效果看到的是前面效果套用後的狀態。每個效果（含被 `when` 跳過以外的所有效果）發出一筆 `effect` 事件：`outcome`、`effect`、`target`（資源／狀態／互動／cue 的 id）、`value`（求值後的數值；`timeScale` 為 scale）、`frames`（幀數類效果與 `timeScale`）。

## 4. 互動（`InteractionDef`）

### 4.1 欄位
| 欄位 | 意義 |
|---|---|
| `id`、`name`、`key?`、`color?` | `key` 只是 UI 提示，真正的按鍵由宿主決定 |
| `priority` | 同一幀有多個可接受的按鍵時，數字小的優先；同數字依 `interactions` 列表順序 |
| `startup` | 按鍵被接受後，到第一個判定窗之前的幀數。啟動期間沒有保護 |
| `windows[]` | 連續的判定窗 `{id, name, frames, strict?}`，依順序排列 |
| `successRecovery` / `whiffRecovery` | 判定窗結束後的收招硬直：有攔截到攻擊（或判定窗總長為 0）用前者，否則用後者 |
| `maxCatches` | 一次按鍵最多攔截幾次攻擊；0 = 不限。達到上限時判定窗提早結束 |
| `table[]` | 結果表（§4.5） |
| `whiffOutcome?` | 揮空時套用的結果 |
| `onAccept?` | 按鍵被接受時套用的結果（例如技能給予無敵） |
| `cooldown` | 接受後幾幀內不能再接受這個互動 |
| `charges?` | 充能 `{max, recharge, mode}`；沒有充能就不能用 |
| `cost?` | 資源消耗 `{resource, amount}`；不足就不能用，接受時扣除 |
| `buffer` | 忙碌時按下的鍵保留幾幀；0 = 直接丟棄 |
| `spam?` | 防連打（§4.4） |

### 4.2 動作槽與階段
玩家只有**一個動作槽**。被接受的互動成為目前動作，經過：

```
接受幀 p ─ 啟動 [p, p+startup) ─ 判定窗 w1, w2, … ─ activeEnd ─ 收招 [activeEnd, recoveryEnd) ─ 閒置
```

- 第一個判定窗從 `p + startup` 開始，依序相接。`activeEnd = p + startup + Σ有效幀數`（§4.3）。
- 動作存在、或 `t < stunUntil` 時，動作槽**忙碌**。

### 4.3 有效判定窗（嚴格窗）
接受時依縮減量 `s` 計算每個判定窗的有效長度：對每個 `strict` 判定窗，`cut = min(frames, s)`，長度減掉 `cut`，被減掉的幀數**移給它後面第一個非嚴格判定窗**（沒有就直接刪除）。被縮到 0 幀的判定窗仍保留在 `windows` 中（`from = to`）。

- 一般按鍵：`s` = 防連打縮減量（§4.4），沒有就是 0。
- 從緩衝接受的按鍵：所有嚴格判定窗**整個**被移除（`s = ∞`）。事件中 `shrink` 記錄實際使用的值，緩衝時記為 -1。

例：完美 3 幀（strict）＋普通 6 幀，`s = 2` → 完美 1 幀、普通 8 幀。

### 4.4 防連打 `spam`
`{withinFrames, scope, shrinkPerPress, maxShrink, lockoutAfter, lockoutFrames}`。

- **每一次原始按鍵**（不論最後被接受或丟棄）都記入按鍵歷史。
- 幀 `t` 按下互動 X 時，`n` = 歷史中滿足 `t - withinFrames < 幀 ≤ t` 的其他按鍵數；`scope = "self"` 只算 X 自己，`"all"` 算全部。同一幀比它早處理的按鍵也算。
- 若 `lockoutAfter > 0` 且 `n ≥ lockoutAfter`：丟棄（`spamLockout`），`stunUntil = max(stunUntil, t + lockoutFrames)`。這個鎖定**不會**中斷目前動作。
- 否則縮減量 `s = min(n × shrinkPerPress, maxShrink)`。

### 4.5 結果表
`table` 是有順序的列 `{tag, cells}`。攻擊在判定窗 `w` 被結算時：
1. 由上往下找**第一列**符合的：`tag` 為 null，或 `tag` 在攻擊的 `tags` 中。
2. 結果 = 該列 `cells[w.id]`。沒有找到列、格子不存在、或為 null → **不攔截**，攻擊繼續往下結算（§7 步驟 4）。只看第一個符合的列，不會往下一列找。

UI 把它畫成矩陣：每列一個標籤（由上往下＝優先順序），最後一列是預設（tag = null），每欄一個判定窗。

### 4.6 延遲校正
攻擊的**結算幀** = `max(收到時的幀, 命中幀 + inputOffset)`。螢幕上子彈在命中幀碰到角色，但判定晚 `inputOffset` 幀才做，用來抵銷顯示器與手把的延遲。

## 5. 公式變數
| 變數 | 意義 |
|---|---|
| `frame` | 目前幀 |
| `attack.damage` | 被結算攻擊的傷害；沒有攻擊（揮空、onAccept）時為 0 |
| `res.<id>` | 資源目前值 |
| `status.<id>` | 狀態剩餘幀數（`max(0, 結束幀 - t)`），含 `status.invulnerable` |
| `charges.<id>` | 互動目前的充能數；沒有充能設定時為 0 |
| `catch.index` | 這次攔截之前，目前動作已攔截的次數（第一次為 0）；沒有動作時為 0 |
| `action.shrink` | 目前動作的縮減量（緩衝為 -1）；沒有動作時為 0 |
| `action.buffered` | 目前動作是否來自緩衝（布林） |

例：連續閃過彈幕時只有第一發給量表 → `addResource gauge 20`，`when: catch.index == 0`。

## 6. 招式輔助 `AttackDef`
`{id, name, windup, telegraph, recovery, hits[{offset, damage?, tags}]}`。`expandAttack(def, start)` 產生攻擊事件：第 i 段命中幀 = `start + windup + hits[i].offset`，`id = "<def.id>#<i>"`。`telegraph` 與 `recovery` 只給畫面使用。

## 7. 逐幀步驟（`stepTiming`）
狀態 `TimingState` 的 `frame` 是**下一個要處理的幀** `t`。處理完 `frame` 加 1。

**0. 已敗北**：若 `defeated`，所有按鍵丟棄（`defeated`），清空待結算攻擊，跳到結尾。

**1. 計時**
- 移除結束幀 ≤ t 的狀態。
- 充能：sequential 若 `pending[0] ≤ t` → 充能 +1，未滿則 `pending = [pending[0] + recharge]`，滿了則清空；parallel 取出所有 ≤ t 的計時，每個 +1。每次增加發出 `recharge`。
- 刪除超過所有互動最大 `withinFrames` 的按鍵歷史。

**2. 動作階段**（可在同一幀連續轉換）
- 在判定窗中且 `t ≥ activeEnd`：進入收招，`recoveryEnd = activeEnd + 硬直`（§4.1）。若沒有攔截且判定窗總長 > 0 → 發出 `whiff`，套用 `whiffOutcome`。發出 `phase recovery`。
- 在收招中且 `t ≥ recoveryEnd`：清空動作，發出 `phase idle`。

**3. 輸入**
1. 依輸入順序處理本幀的每個按鍵：發出 `press`，記入歷史，套用 §4.4 鎖定檢查；通過的按鍵帶著縮減量 `s` 成為候選。
2. 若有緩衝且 `t - 緩衝按鍵幀 > buffer` → 丟棄（`bufferExpired`）。
3. **動作槽忙碌時**：候選中 `buffer > 0` 的，依 (priority, 列表順序) 取最優先的一個放入緩衝（已有緩衝則舊的丟棄 `bufferReplaced`），發出 `buffer`；其餘候選丟棄，`buffer = 0` 的原因為 `busy`，其他為 `conflict`。
4. **動作槽空閒時**：候選 = 本幀候選＋緩衝中的按鍵。每個候選依序檢查：冷卻（`t < readyAt` → `cooldown`）、充能（0 → `noCharge`）、資源（不足 → `noResource`），失敗就丟棄。剩下的依 (priority, 列表順序, 新按鍵優先於緩衝) 選一個接受，其餘丟棄（`conflict`）。清空緩衝。
5. **接受**：扣充能（sequential 若沒有計時則 `pending = [t + recharge]`；parallel 加入 `t + recharge`）、扣資源，`readyAt = t + cooldown`，依 §4.3 建立動作，發出 `accept`，然後套用 `onAccept`。

**4. 攻擊結算**：把本幀收到的攻擊依 §4.6 加入待結算清單（依結算幀排序，同幀保持加入順序），然後依序結算所有結算幀 ≤ t 的攻擊：
1. 已 defeated → 停止，清空剩下的待結算攻擊。
2. 若有動作、`t < activeEnd`、`t` 落在某個判定窗 `w` 內，且未達 `maxCatches` → 查結果表（§4.5）。有結果時：發出 `resolve`（via interaction），套用結果（`catch.index` = 攔截前次數），攔截次數 +1；達到 `maxCatches` 時 `activeEnd = t + 1`。結算下一發。
3. 否則若無敵中（`status.invulnerable > 0`）→ 發出 `resolve`（via invulnerable，outcome null）。
4. 否則發出 `resolve`（via hit），套用 `hitOutcome`。

**結尾**：`frame = t + 1`。

### 7.1 腳本執行 `runTiming(config, script)`
從 `createTimingState(config)` 開始，對 `t = 0 … frames-1` 呼叫 `stepTiming`，本幀的按鍵是 `script.presses` 中 `frame = t` 的項目（依列表順序），攻擊是 `script.attacks` 中 `frame = t` 的項目。回傳全部事件與最終狀態。

### 7.2 初始狀態
`frame = 0`；資源取 `initial`；沒有狀態；`stunUntil = 0`；沒有動作；有充能的互動 `count = max`、`pending = []`；`readyAt` 全為 0；沒有緩衝、歷史、待結算攻擊；`defeated = false`。

## 8. 驗證（`validateTiming`）
錯誤：id 重複（各類別內）；引用不存在的結果、互動、資源、狀態、標籤、判定窗；幀數欄位不是非負整數；`fps ≤ 0`；`charges.max < 1` 或 `recharge < 1`；`healthResource` 不存在；公式結構不合法或引用 §5 以外的變數。
警告：結果表中某判定窗在預設列沒有格子；互動沒有任何判定窗也沒有 `onAccept`；`maxShrink` 大於所有嚴格窗長度。

## 9. 預設設定
`TIMING_PRESETS`：寬鬆、魂系、隻狼風、魔女時間，以及示範自訂互動的「互動展示」（看破、跳躍、吸收）。全部包含格擋 `parry`、閃避 `dodge`、技能 `skill`（量表滿才能用，給予數秒無敵），以及標籤 bullet／unblockable／thrust／sweep／energy。

## 10. 補充約定（實作與向量一致）
- **effect 事件欄位**：`damage`／`addResource`／`restoreCharge`／`cue` 帶 `value`（`damage` 為 `max(0, amount)`；`restoreCharge` 為取整後的 n；`cue` 只在有 `value` 時）；`invulnerable`／`status`／`stun`／`hitstop` 只帶 `frames`；`timeScale` 帶 `value`（scale）與 `frames`；`target`：damage＝`healthResource`、addResource＝資源、invulnerable＝`"invulnerable"`、status＝狀態、restoreCharge＝互動、cue＝cue 名稱。`restoreCharge` 的 n 也是 `max(0, roundHalfAway(值))`。
- **被 `when` 跳過的效果不發出任何事件。**
- **已敗北（步驟 0）**：每個按鍵只發出一筆 `drop`（reason `defeated`，`pressFrame` = 目前幀），不發出 `press`；緩衝也一併清空。
- **步驟 2**：收招時先發出 `whiff`（並套用 `whiffOutcome`），再發出 `phase recovery`；若 `whiffOutcome` 讓動作被清空（stun、cancelRecovery），不再發出 `phase recovery`。
- **步驟 3.3 的事件順序**（動作槽忙碌）：被選中放入緩衝者先發出（若取代舊緩衝則先發出舊緩衝的 `bufferReplaced`，再發出 `buffer`），之後其餘候選依按鍵順序發出 `drop`。
- **步驟 3.4 的事件順序**（動作槽空閒）：所有被丟棄的候選依「本幀按鍵順序、緩衝者最後」發出 `drop`（冷卻／充能／資源失敗與 `conflict` 混合），然後才是 `accept`。
- **緩衝狀態**：`buffered.shrink` 固定存 -1。緩衝逾期檢查用被緩衝互動自己的 `buffer`。
- **攔截次數**：只有在結果套用後動作仍是同一個動作時才 +1（結果中的 stun／cancelRecovery 會清空動作，此時不計）。
- **結算排序**：待結算清單以 `max(目前幀, 命中幀 + inputOffset)` 穩定排序；`runTiming` 的攻擊永遠在命中幀收到，所以等於依命中幀加上 `inputOffset` 排序。
- **驗證**：`inputOffset` 與所有幀數欄位同為非負整數；資源 `initial` 必須在 `[0, max]`；宣告名為 `invulnerable` 的狀態是錯誤。警告「預設列沒有格子」的判斷：該判定窗的 id 沒有出現在任何 `tag = null` 列的 `cells` 鍵中（值為 null 也算有格子；完全沒有預設列時每個判定窗都警告）。`maxShrink` 警告條件：`maxShrink` 大於所有嚴格窗中最長的幀數（沒有嚴格窗視為 0）。
- **軌跡（非規格、不進向量）**：`runTiming(config, script, { trace: true })` 另回傳每幀處理完畢後的快照 `FrameTrace[]`，只供 UI 畫幀條。
