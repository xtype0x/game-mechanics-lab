# 傷害規格

## 1. 名詞
- **元件（component）**：一組統計值定義、旗標定義與傷害步驟，宣告 `provides`／`requires`／`conflicts` 能力。
- **步驟（step）**：管線中的一個乘區或設定值。
- **情境（scenario）**：攻擊方與防守方數值、技能、旗標、修正值。

## 2. 修正值模型
修正值（modifier）作用在 `stat:<side>.<key>` 或 `step:<stepId>`。

```
對目標的所有修正值，依列表順序：
  跳過 enabled == false
  若有 condition 且為假 → 記為 inactive，不套用
  add      → addSum  += value
  pct      → pctSum  += value
  mul      → mulProd *= value
  override → override = value       （多個時最後一個生效）

raw   = override 存在 ? override : (base * (1 + pctSum) + addSum) * mulProd
value = raw；若 value < cap.min 則 = cap.min；若 value > cap.max 則 = cap.max
value = rounding(value)
```
運算順序必須完全照上式（見 numeric.md 第 3 點）。`addSum`、`pctSum` 從 0 開始依序累加；`mulProd` 從 1 開始。

預設與限制：
- `value` 一律是數值常數（不是表示式）。
- `enabled` 省略時為 true。
- `op` 只允許上述四種；其他值使專案檔驗證失敗。
- `cap` 省略或其 `min`／`max` 省略時，該方向不限制。
- `rounding` 省略時為 `none`。
- 作用目標若不是已宣告的統計值或步驟，該修正值不產生任何效果。

## 3. 規則組合（composeRules）
1. 依 `config.components` 順序取元件；統計值與旗標以第一次出現者為準。統計值的識別為 **(side, key)**，旗標為 **key**。接著加入 `config.customStats`、`config.customFlags`（若識別已存在則忽略）。
2. 步驟 = 各元件步驟依序串接，再接 `config.customSteps`。
3. 移除 `disabledSteps` 中的步驟。
4. 對每個剩下的步驟，以 `overrides[stepId]` 中**有定義的欄位**淺層取代（可覆寫 `label`、`base`、`cap`、`rounding`、`order`；`cap` 整個物件取代，不逐欄合併；`id`、`apply` 不可覆寫）。停用的步驟不套用覆寫。
5. 依 `order` 由小到大**穩定排序**（同 order 保持第 2 步的順序）。
6. 暴擊率公式取第一個定義 `critChance` 的元件。

## 4. 計算流程
### 4.1 統計值
只有**已宣告**的統計值與旗標存在於 scope；情境中多出來的鍵會被忽略。
對每個統計值：`base = scenario[side][key]`，缺少時用宣告的 `default`。
套用 `stat:` 修正值，`cap = {min, max}` 取自統計值定義，不取整。
**統計值修正的條件只能看到所有已宣告統計值的基礎（未修正）值、技能與旗標（此時 flags.crit = false）**，避免循環相依。不可使用 hit、step、prev。

### 4.2 每段命中
對 `skill.hits` 的每一段 i（比例 `ratio = hits[i]`），獨立執行：
```
scope = { attacker.*, defender.*（最終統計值）,
          skill.multiplier, skill.type, skill.element,
          flags.*（情境值，缺少時用預設；flags.crit 由計算模式決定）,
          hit.ratio, hit.index, hit.count,
          step.<id>（已執行步驟的值）, prev（目前累計值）}
running = 0
for step in 排序後步驟:
    prev = running
    base = eval(step.base, scope)
    v    = 修正值模型(base, step: 修正值, scope, step.cap, step.rounding)
    running = step.apply == "set" ? v : running * v
    step.<id> = v
damage_i = finalRounding(max(running, minDamage))
```
- `hit.index` 從 0 開始；第一個步驟的 `prev` 為 0。
- 每步記錄的「步驟值」是套用修正、上下限與步驟取整後的 v。
- `finalRounding` 與 `minDamage` 為必填，沒有預設值；先取 max 再取整。

總傷害 = Σ damage_i，依命中順序由左至右相加。

### 4.3 暴擊
- `p = clamp(eval(critChance, scope), 0, 1)`，scope 為**最終**統計值、技能、旗標（flags.crit = false），不含 hit/step/prev；沒有暴擊元件時 p = 0。
- 每段命中獨立判定。`C_i`、`N_i` 分別為該段在 flags.crit = true／false 時的傷害。
- 期望值：`E = 0`；依命中順序 `E = E + ((1 − p)·N_i + p·C_i)`。
- 精確分布：從 {0: 1} 開始，依命中順序卷積。對目前分布的每個點（依插入順序），先加入未暴擊分支 `v + N_i`（機率 × (1 − p)），再加入暴擊分支 `v + C_i`（機率 × p）；值相同時機率相加。p = 0 或 1 時不產生機率為 0 的點。**每次卷積後**若點數超過 4096 則拒絕計算。
- 輸出依值由小到大排序。
- 抽樣：建立**一個** `Rng(seed, "damage.crit")`，連續用於全部 n 個樣本。每個樣本的總傷害 = 依命中順序，對每段呼叫一次 `chance(p)`，為真取 C_i、否則取 N_i，由左至右相加。

## 5. 內建元件公式
| 元件 | 步驟 | apply | order | 公式 | cap |
|---|---|---|---|---|---|
| dmg.base-atk | base | set | 0 | `attacker.atk * skill.multiplier * hit.ratio` | |
| dmg.def-sub | defSub | set | 5 | `max(prev - defender.def * hit.ratio * (1 - attacker.defIgnore), prev * 0.1)` | |
| dmg.crit | crit | mul | 10 | `if(flags.crit, 1 + attacker.critDmg, 1)` | |
| dmg.bonus | dmgBonus | mul | 20 | `1 + attacker.dmgBonus` | min 0 |
| dmg.def-ratio | defRatio | mul | 30 | `1 - D / (D + 200 + 10 * attacker.level)`，D = `defender.def * (1 - attacker.defIgnore)` | |
| dmg.res | res | mul | 40 | `1 - (defender.res - attacker.resPen)` | 0.1 ~ 2 |
| dmg.vuln | vuln | mul | 50 | `1 + defender.vulnerability` | min 0 |
| dmg.reduction | reduction | mul | 60 | `1 - defender.dmgReduction` | min 0 |
| dmg.toughness | toughness | mul | 70 | `if(flags.broken, 1, 0.9)` | |

這些是本工具自行設計的通用公式，不是任何特定遊戲的原始公式。

### 手算範例（預設情境，標準乘區型）
（預設情境有 `dmgReduction` 0.1，但標準乘區型不含減傷元件，所以不影響。）
攻擊 2400、倍率 2、兩段各 0.5、暴擊率 60%、暴傷 120%、增傷 40%、等級 80、防禦 1000、抗性 20%。
- 每段基礎 = 2400 × 2 × 0.5 = 2400
- 防禦乘區 = 1 − 1000 / 2000 = 0.5；抗性乘區 = 0.8
- 非暴擊 = 2400 × 1 × 1.4 × 0.5 × 0.8 × 1 = 1344
- 暴擊 = 2400 × 2.2 × 1.4 × 0.5 × 0.8 = 2956.8 → 2956
- 分布：2688（16%）、4300（48%）、5912（36%）

## 6. 相容性檢查

### 6.1 可用變數名稱
步驟公式可用：已宣告的 `attacker.<key>`、`defender.<key>`、`flags.<key>`，以及 `flags.crit`、`skill.multiplier`、`skill.type`、`skill.element`、`hit.ratio`、`hit.index`、`hit.count`、`prev`，以及排序在自己**之前**的 `step.<id>`。
暴擊率公式可用：同上，但**不含** `hit.*`、`step.*`、`prev`。

### 6.2 錯誤（狀態 = 不相容）與計數規則
依下列順序檢查；每一列說明「產生幾個錯誤」：

| 檢查 | 計數 |
|---|---|
| 找不到元件 | 每個找不到的元件 ID 一個；該元件之後的所有檢查都略過它 |
| 同一能力被多個元件提供 | 每個重複的能力一個 |
| `requires` 沒有被提供 | 每個（元件, 缺少的能力）一個 |
| 命中 `conflicts` | 每個（元件, 衝突的能力）一個 |
| 多個元件定義暴擊率 | 最多一個 |
| 沒有任何 `set` 步驟 | 最多一個 |
| 步驟 ID 重複（在移除停用步驟之後） | 每次重複出現一個 |
| 步驟公式引用不可用的變數 | 每個（步驟, 不同的變數名稱）一個 |
| 暴擊率公式引用不可用的變數 | 每個不同的變數名稱一個 |

### 6.3 警告（不影響狀態）
| 檢查 | 計數 |
|---|---|
| 有 `set` 步驟，但排序後第一個步驟不是 `set` | 最多一個；沒有 `set` 步驟時不發出（已是錯誤） |
| 兩個已選元件宣告同一統計值但預設值不同（採用前者） | 每個（後出現的元件, 統計值）一個 |
| 自訂數值與已宣告統計值重複 | 每個重複的自訂數值一個 |
| 自訂狀態與元件旗標重複 | 每個重複的自訂狀態一個 |

### 6.4 狀態
- 有任何錯誤 → `incompatible`。
- 否則，若沒有自訂步驟、覆寫、停用、自訂數值與狀態，且所選元件集合與某範本完全相同（不計順序）→ `verified`，並將 `matchedTemplate` 設為該範本 ID。
- 否則 → `experimental`。
- `matchedTemplate` 只在 `verified` 時有值，其他狀態為空（向量中為 null）。
- 範本清單收錄在 `vectors/damage.json` 的 `templates`。

錯誤訊息文字屬於介面，不在規格內；移植版本只需符合狀態、`matchedTemplate` 與錯誤／警告數量（見 `compat` 向量）。
