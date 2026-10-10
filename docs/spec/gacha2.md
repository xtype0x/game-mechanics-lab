# 抽卡規格 2.0（模組化規則）

規則版本 2.1.0（2.1：新增 `epitomized` 定軌模組；不含它的模型行為與 2.0 完全相同）。實作：`packages/core/src/gacha2/`（`@ggt/core` 匯出為命名空間 `Gacha`）。向量：`packages/core/vectors/gacha2.json`。

1.0（[gacha.md](gacha.md)）的卡池可用 §6 轉換成 2.0 模型，**逐抽結果完全相同**。1.0 仍保留給主控台與 DEMO 使用。

## 1. 資料
### 1.1 模型 `GachaModel`
`version: 2`、`id`、`name`、`description?`、`source?`（規則來源與可信度說明）、`pull`、`tiers`、`items`、`modules`。

- `pull`：`cost`（每抽貨幣）、`currency`（顯示名稱）、`batchSize`（連抽數量，例如 10）、`batchCost?`（整組連抽價格，與 `batchSize × cost` 不同時才填）。
- `tiers`：稀有度**由高到低**，`{id, name, rate, items}`。最後一個稀有度的 `rate` 不使用（取剩餘機率）。`items` 為一般（非限定）物品。
- `items`：與 1.0 相同（gacha.md §1.3）。

### 1.2 規則模組 `RuleModule`
模組的效果**與在列表中的順序無關**，依 §2 的固定步驟套用。同一種模組在同一稀有度只能有一個（`batchFloor`、`exchange` 全模型只能一個）。

| kind | 欄位 | 意義 |
|---|---|---|
| `softPity` | tier, start, step | 從第 start 抽（自上次獲得該稀有度起算）起，每抽機率 + step |
| `hardPity` | tier, at | 第 at 抽必得該稀有度（除非被更高稀有度搶先） |
| `featured` | tier, share, items | 抽中該稀有度時，有 share 機率是限定（物品改從 items 抽） |
| `guarantee` | tier | 抽中該稀有度但不是限定後，下一次抽中必定是限定（需要 featured） |
| `batchFloor` | slot, minTier | 每組連抽的第 slot 抽，低於 minTier 的機率全部移到 minTier |
| `milestone` | tier, steps[{at, featuredShare}] | 計數＝自上次抽到該稀有度**限定**起的抽數；計數到達 at 的那一抽必得該稀有度，限定機率改為 featuredShare（1＝必定限定）（需要 featured） |
| `exchange` | pointsPerPull, cost, items | 每抽得 pointsPerPull 點；cost 點可換一個 items 中的物品（玩家動作，§2.4） |
| `epitomized` | tier, item, points | 定軌：item 必須是該稀有度的限定物品。每次抽中該稀有度但不是 item 時加 1 點；點數達到 points 時，下一次抽中該稀有度必定是 item；抽到 item 時歸零（需要 featured） |

### 1.3 狀態 `ModelState`
`vars`：整數計數器；`pulls`：總抽數。計數器名稱與存在條件（`stateVars`，固定順序：稀有度由高到低，每個稀有度依 since、guar、miss、fate，最後 pts、batch）：

| 名稱 | 存在條件 | 意義 |
|---|---|---|
| `since:<tier>` | 該稀有度有 softPity 或 hardPity | 自上次獲得該稀有度的抽數 |
| `guar:<tier>` | 有 guarantee | 1＝下一次必定限定 |
| `miss:<tier>` | 有 milestone | 自上次獲得該稀有度限定的抽數 |
| `fate:<tier>` | 有 epitomized | 定軌點數 |
| `pts` | 有 exchange | 兌換點數 |
| `batch` | 有 batchFloor | 目前在連抽中的位置（0 起） |

新狀態全為 0。DEMO 或伺服器假設**所有抽卡都以整組連抽進行**時，batch 才與實際的「第幾抽」對齊。

## 2. 單抽
### 2.1 稀有度機率 `tierRate(i, c)`
與 1.0 相同（gacha.md §2.1），只是 soft／hard 參數來自模組。c = `since:<tier> + 1`（沒有該計數器時為 1）。

### 2.2 本抽情境 `pullContext(vars)`
1. **門檻**：`acc = 0`；對除最後一個以外的稀有度 i：`acc = acc + tierRate(i, c_i)`，`T_i = acc`（不夾限）。`T_last = ∞`。
2. **累計保底**：依稀有度由高到低，第一個「`miss:<tier> + 1` 等於某個 step.at」的稀有度 k 被強制：`T_i = 0`（i < k）、`T_i = ∞`（i ≥ k），並記錄限定機率覆寫 `step.featuredShare`。
3. **連抽保底**：沒有被累計保底強制，且 `batch + 1 == slot` 時：`T_minTier = ∞`（記錄 floor = minTier）。
4. **各稀有度機率**：`chance_i = max(prev, min(1, max(0, T_i))) − prev`，prev 依序更新；最後一個稀有度為 `1 − prev`。
5. **限定分配**（有 featured 且物品非空的稀有度 t）：
   - 定軌觸發 ＝ t 有 epitomized 且 `fate:t ≥ points`；
   - 必定限定 ＝ 定軌觸發，或 `guar:t == 1`，或 t 的一般物品為空，或 t 被強制且覆寫值 ≥ 1；
   - 否則限定機率 ＝ 被強制時的覆寫值，否則 share。

### 2.3 抽一次 `pull(model, state, rng)`
1. `u = rng.next()`；稀有度 ＝ 第一個 `u < T_i` 的 i，都不是時為最後一個。
2. 有限定分配時：必定限定則不抽亂數；否則 `featured = rng.next() < 限定機率`。
3. 定軌觸發時 `itemId = item`，**不抽亂數**；否則物品池 ＝ 限定物品或一般物品，`itemId = pool[rng.int(pool.length)]`（抽一次）。
4. 計數更新 `nextVars`：
   - `since:<i>`：抽中的稀有度歸 0，其他 + 1；
   - `guar:<t>`：只在抽中 t 時更新：限定 → 0，否則 → 1；
   - `miss:<t>`：抽中 t 且是限定 → 0，否則 + 1；
   - `fate:<t>`：只在抽中 t 時更新：物品是定軌的 item → 0，否則 + 1；
   - `pts += pointsPerPull`；`batch = (batch + 1) mod batchSize`。
5. `pulls += 1`。回傳 `{tierId, itemId, featured, forced}`；forced 表示稀有度由累計保底或連抽保底決定。

亂數用量與 1.0 完全相同：每抽 next（稀有度）、需要時 next（限定）、int（物品；定軌觸發時省略）。

### 2.4 兌換 `exchange(model, state, itemId)`
`pts ≥ cost` 且 itemId 在兌換清單時：`pts −= cost`，回傳成功。不改變其他計數器。

## 3. 精確分析
### 3.1 計數器值域 `varDomain`
`since:<t>`：與 1.0 的 tierCap 相同。`guar`：2。`fate:<t>`：points + 1。`miss:<t>`：最大的 at + 1（超過最大門檻後不再變化）。`pts`：兌換 cost（自動兌換後恆小於 cost）。`batch`：batchSize。分析時計數器超出值域時取最大值（pts 除外）。

### 3.2 分支 `pullBranches(vars)`
對每個 chance > 0 的稀有度 i：有限定分配時拆成「限定」（機率 chance × pf）與「非限定」（chance × (1 − pf)），pf ＝ 必定限定 ? 1 : 限定機率（夾在 [0, 1]）；否則一支。有定軌的稀有度另外標記 chosen：定軌觸發時只有一支（限定、chosen）；否則限定分支再拆成 chosen（× 1 ∕ 限定物品數）與非 chosen（其餘），非限定分支為非 chosen。只保留機率 > 0 的分支。順序：稀有度由高到低，限定（chosen 先）先於非限定。

### 3.3 目標的抽數分布 `targetDistribution(model, target, start?)`
目標 `{tier, mode, itemId?, copies, useExchange?}`：mode 為 `tier`（任一該稀有度）、`featured`（任一限定）、`item`（指定物品；在限定池或一般池中均分）。**目標可以是任何稀有度。**

**相關計數器** `relevantVars`（其餘計數器不影響目標稀有度的機率，捨去以縮小狀態）：
- `since:<i>`：i 不低於目標稀有度，或 i 有累計保底；
- `guar:<i>`：i 是目標稀有度，或 i 有累計保底；
- `miss:*`：全部；
- `fate:<i>`：i 是目標稀有度；
- `pts`：有兌換、`useExchange !== false`、mode 不是 tier，且兌換清單含目標（featured：任一限定物品；item：該物品）；
- `batch`：連抽保底的 minTier 不低於目標稀有度，或不低於某個有累計保底的稀有度。

**轉移表**：每個相關計數器狀態 s，對每個分支 b：next ＝ nextVars 後夾限；若有 pts 且 `pts ≥ cost`，反覆 `pts −= cost` 並得到 1 份（**自動兌換**策略）。b 落在目標稀有度時，成功機率 sc ＝ tier：1；featured：限定分支 1、否則 0；item：chosen 分支為「目標是定軌物品 ? 1 : 0」；其餘分支的池（限定且非 chosen 時為限定物品去掉定軌物品）含目標時 1 / 池大小，否則 0。nextVars 的 chosenHit 取分支的 chosen。輸出邊：`(p_b × sc, next, 1 + 兌換份數)`（sc > 0）、`(p_b × (1 − sc), next, 兌換份數)`（sc < 1）。

**迭代**：初始份數＝開始時已可兌換的份數。每抽：對 k（由小到大）、s（由小到大）、邊（依表順序）：k + gain ≥ copies 時記入本抽完成機率，否則累加到 (k + gain, next)。迭代到剩餘機率 ≤ 1e−12 或 100000 抽。輸出 pmf、cdf（依序累加）、tail、`mean = Σ n·pmf[n]`、states（狀態數）。狀態數超過 200,000 時為錯誤。

### 3.4 n 抽後的份數 `copiesAfter(model, target, n, maxCopies)`
同一轉移表（copies = 1），不吸收；份數超過 maxCopies 時計為 maxCopies。回傳 P(k)，k = 0..maxCopies。

### 3.5 長期比例 `longRun(model)`
全部計數器（pts 除外）的聯合鏈，方法與 1.0 §3.3 相同（懶惰鏈、1e−15、200000 步）；狀態上限 50,000（超過為錯誤，工具改用抽樣）。輸出各稀有度長期比例與各稀有度中限定的長期比例。不含兌換。

### 3.6 保證上限 `worstCase(model, target, start?)`
在 §3.3 的狀態圖（只看機率 > 0 的邊）上，自起點出發：若存在不經過完成就能回到自己的循環，為 null（沒有保證）；否則為到完成的最長路徑長度（抽數）。

## 4. 統計
`summarize(d)`：mean、variance、sd、skewness（第三標準化動差）、百分位（第一個 `cdf[n] ≥ q − 1e−12` 的 n）、hazard（`pmf[n] / (1 − cdf[n−1])`，條件機率：前面都沒完成時，第 n 抽完成的機率）。

`simulateTarget`：亂數流 `gacha2.mc`，每次重新開始，抽到完成為止並使用與 §3.3 相同的自動兌換策略；平均數的 95% 信賴區間用常態近似。`wilson(k, n)`：比例的 95% Wilson 區間。

## 5. 成本
### 5.1 需要的貨幣 `currencyFor(model, n, wallet)`
付費抽數 `paid = max(0, n − freePulls)`；有 batchCost 時 `floor(paid / batchSize) × batchCost + (paid mod batchSize) × cost`，否則 `paid × cost`；再減去持有貨幣（不小於 0）。

### 5.2 最便宜的儲值 `topUpTable(packs, maxNeed)`
每個儲值方案 `{price, amount, firstBonus?}`：首儲為只能買一次的品項（price, amount + firstBonus），另外每個方案都是可無限購買的品項（price, amount）。以所有數量的最大公因數為單位，計算 `price[x]`＝取得至少 x 單位貨幣的最低價格：先依序處理一次性品項（x 由大到小），再處理無限品項（x 由小到大）。可還原購買組合。

### 5.3 花費統計 `spend`
隨抽隨買（每抽需要時以最便宜的組合補足）：期望花費 `Σ pmf[n] × price(currencyFor(n))`；P50／P90／P99 與保證上限分別取對應抽數的價格（價格對抽數單調不減）。

## 6. 從 1.0 轉換 `modelFromBanner`
每個 1.0 稀有度：soft 參數 → softPity；hardPity → hardPity；featured → featured（＋ guarantee 時加 guarantee）。`pull.cost = banner.cost`、`batchSize = 10`。1.0 的單抽、分布與長期比例與轉換後的 2.0 相同（分布與比例容許浮點差 1e−12）。

## 7. 數值精度
單抽只用比較與加法，移植版本應逐抽一致。分布、比例與花費的期望為浮點累加，向量比對容許誤差 1e−9。
