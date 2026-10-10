# 抽卡規格

規則版本 1.0.0。實作：`packages/core/src/gacha/`。向量：`packages/core/vectors/gacha.json`。

所有資料都是純 JSON；給定（卡池, 初始狀態, 亂數流）結果完全確定。正式營運時抽卡應在伺服器執行，本規格同時是伺服器實作的依據。

## 1. 資料
### 1.1 卡池 `BannerDef`
`id`、`name`、`cost`（每抽花費，只供預算工具與 DEMO 使用）、`tiers`、`items`、`description?`。

### 1.2 稀有度 `GachaTier`
依**稀有度由高到低**排列。
- `rate`：基礎機率。**最後一個稀有度的 rate 不使用**，機率為剩餘值。
- `softPityStart?`、`softPityStep?`：軟保底。
- `hardPity?`：硬保底（0 或省略為沒有）。
- `featured?`：限定規則 `{share, guarantee, items}`（§2.3）。
- `items`：一般（非限定）物品 ID。

### 1.3 物品 `GachaItem`
`id`、`name`、`kind`：`"unit"`（`unitId` 指向角色定義）或 `"resource"`（`resource`、`amount`）。抽卡規則本身不讀 kind；如何發放由使用端（DEMO、伺服器）決定。

### 1.4 狀態 `GachaState`
`counters[tierId]`：自該稀有度上次獲得以來的抽數（不設上限）。`guaranteed[tierId]`：下一次獲得該稀有度時必定為限定。`pulls`：總抽數。新狀態全為 0／false。

## 2. 單抽 `pullOnce(banner, state, rng)`
### 2.1 稀有度機率
本抽的計數 `c_t = counters[t] + 1`（從 1 起）。

`tierRate(t, c)`：
1. `hardPity > 0` 且 `c ≥ hardPity` → 1。
2. 否則 `r = rate`；若 `softPityStart > 0` 且 `c ≥ softPityStart`：`r = rate + (c − softPityStart + 1) × (softPityStep ?? 0)`。
3. 結果限制在 [0, 1]。

### 2.2 決定稀有度
1. `u = rng.next()`（**每抽固定一次**）。
2. `acc = 0`；依序對除了最後一個以外的稀有度 i：`acc = acc + tierRate(i, c_i)`；若 `u < acc` 則選中 i 並停止。都沒選中時為最後一個稀有度。
   - 等價的機率：稀有度 i 為 `min(1, acc_i) − min(1, acc_{i−1})`；最後一個為 `1 − min(1, acc_{n−2})`（`tierChances`）。高稀有度優先，因此高稀有度的保底會蓋過低稀有度的保底。
3. **計數**：選中的稀有度 `counters = 0`；其他稀有度 `counters = c_t`（即使它這抽到達硬保底但被更高稀有度蓋過，也繼續累加，下一抽仍為必中）。`pulls += 1`。

### 2.3 限定與物品
設選中的稀有度為 t。
1. 若 t 有 `featured` 且 `featured.items` 非空：
   - `guaranteed[t]` 為真、或 t 的 `items` 為空 → 限定，**不抽亂數**；
   - 否則 `featured = rng.next() < share`；
   - 之後 `guaranteed[t] = featured ? false : guarantee`。
2. 否則不是限定。
3. 物品池為限定 `featured.items` 或一般 `items`；`itemId = pool[rng.int(pool.length)]`（**每抽固定一次**，即使池中只有一個物品）。池為空時為錯誤（驗證器事先標示）。
4. 回傳 `{tierId, itemId, featured, pity: c_t}`。

亂數用量：每抽 1 次 `next`（稀有度）＋（需要時）1 次 `next`（限定判定）＋ 1 次 `int`。

## 3. 精確分析
### 3.1 保底狀態數 `tierCap(t)`
計數超過某個值之後機率不再變化，該值為 cap：有硬保底時為 `hardPity`；否則若有軟保底且 step > 0，為第一個使 `tierRate ≥ 1` 的 c（從 softPityStart 起往上找，上限 100000）；否則為 `softPityStart`（> 0 時）或 1。分析時計數狀態為 0..cap−1，會超過的計數停在 cap−1。

### 3.2 達成目標的抽數分布 `targetDistribution(banner, target, start?)`
只針對**最高稀有度**（它不受其他稀有度影響）。目標 `target = {mode, copies, itemId?}`：
- `tier`：任何一次最高稀有度；
- `featured`：任何限定物品；
- `item`：指定的某個限定物品（限定池中均分）。

狀態 `(k 已得數, g 是否大保底, c 計數)`，初始 `(0, start.guaranteed, min(start.counter, cap−1))`。每抽：
- `h = tierRate(top, c + 1)`；未中：`(k, g, min(c+1, cap−1))`，機率 `1 − h`。
- 中了（機率 h）：`pFeat = (g 或 一般池為空) ? 1 : share`。最高稀有度沒有限定規則（或限定物品為空）時只能用 tier 模式，其他模式為錯誤；item 模式的 itemId 必須在限定清單中。分支（沒有限定規則時只有「成功，g'=0」一支）：
  - tier：成功（機率 pFeat，g'=0）、成功（1−pFeat，g'=guarantee）；
  - featured：成功（pFeat，g'=0）、失敗（1−pFeat，g'=guarantee）；
  - item：成功（pFeat / n）、失敗但為限定（pFeat − pFeat / n，g'=0）、失敗非限定（1−pFeat，g'=guarantee）。
  - 成功時 k+1；k 達到 copies 即記入 `pmf[n]`；否則回到 `(k', g', 0)`。

迭代到剩餘機率 ≤ 1e−12 或 100000 抽。輸出 `pmf`、`cdf`（依序累加）、`tail`（剩餘機率）、`mean = Σ n × pmf[n]`（不含 tail）。累加順序：k 由小到大、g 由 0 到 1、c 由小到大，分支依上列順序。

`percentile(d, q)`：第一個 `cdf[n] ≥ q − 1e−12` 的 n。`chanceWithin(d, n)`：`cdf[min(n, 最後)]`。

### 3.3 長期稀有度比例 `tierLongRunRates(banner)`
所有非最後稀有度的計數組成聯合狀態（各自 0..cap−1，總數上限 2,000,000）。轉移機率為 §2.2 的 `tierChances`（計數 + 1）。以「懶惰鏈」 `(P + I) / 2` 從全 0 狀態迭代，直到各狀態變化的最大值 < 1e−15 或 200000 步，得到穩態 π。各稀有度的長期比例為 `Σ π(s) × tierChances(s)[t]`。對最高稀有度，結果等於 `1 / targetDistribution(tier, 1).mean`。

### 3.4 長期限定比例 `featuredShare(t)`
沒有限定規則：0。一般池為空：1。有大保底：`1 / (2 − share)`。沒有大保底：`share`。

### 3.6 保證上限 `worstCasePulls(banner, target, start?)`
最高稀有度沒有硬保底時為 null。否則先決定最壞情況需要幾次最高稀有度（hits）：
- tier 模式：copies；
- item 模式且限定物品超過一個：null（指定的那一個可能一直抽不到）；
- 沒有限定規則、一般池為空或 share ≥ 1：copies；
- 有限定但沒有大保底：null；
- 有大保底：`2 × copies − (start.guaranteed ? 1 : 0)`。

結果為 `hits × hardPity − min(start.counter, hardPity − 1)`。

### 3.5 機率公示 `disclosure(banner)`
每個稀有度：基礎機率 = §2.2 在全部計數為 1 時的機率；綜合機率 = §3.3。每個物品：
- 限定物品：`稀有度機率 × 限定比例 / 限定物品數`；
- 一般物品：`稀有度機率 × (1 − 限定比例) / 一般物品數`；
- 基礎機率使用 `share`（一般池為空時為 1），綜合機率使用 §3.4。

另產生保底說明文字。產出的表格只是計算結果；**台灣現行的公示義務與格式（網路連線遊戲服務定型化契約應記載及不得記載事項）請以主管機關最新公告為準**。

## 4. 數值精度
`pullOnce` 只做比較與加法，移植版本應逐抽一致。§3 的分布與比例為浮點累加，向量比對容許誤差 `tolerance = 1e−9`。
