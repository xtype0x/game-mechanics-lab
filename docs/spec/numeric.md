# 數值規格

1. 所有數值為 **IEEE 754 binary64（double）**。C# `double`、Java/Kotlin `double`、GDScript `float`、Go `float64` 皆符合。
2. 百分比一律以小數儲存：50% = `0.5`。
3. **運算順序必須與規格的公式逐字一致**。浮點運算不滿足結合律，`(a*b)*c` 與 `a*(b*c)` 可能差 1 ULP，接著 `floor` 後差 1 點傷害。
4. 取整模式：
   | 模式 | 定義 |
   |---|---|
   | `none` | 不取整 |
   | `floor` | 向負無限取整 |
   | `ceil` | 向正無限取整 |
   | `round` | 四捨五入、**半數遠離零**：`x<0 ? -floor(-x+0.5) : floor(x+0.5)`。不可使用 C# `Math.Round` 預設（銀行家捨入）。 |
5. 任何取整結果若為 `-0`，正規化為 `0`。
6. `min`/`max`/`clamp` 不處理 NaN；規格保證正常輸入不產生 NaN（除以零會丟出錯誤）。
