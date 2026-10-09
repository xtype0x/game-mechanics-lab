# 核心規格（v0.4.0）

這些文件是 `packages/core` 的**權威規格**。任何語言的移植版本必須依此實作，並通過 `packages/core/vectors/` 的全部測試向量。
若程式行為與規格不一致，視為程式錯誤。

| 文件 | 內容 |
|---|---|
| [numeric.md](numeric.md) | 數值型別、運算順序、取整 |
| [rng.md](rng.md) | 亂數產生器與亂數流 |
| [expr.md](expr.md) | 規則表示式樹 |
| [damage.md](damage.md) | 修正值模型、傷害管線、暴擊分布、相容性 |
| [battle.md](battle.md) | 回合戰鬥：行動值、技能、削韌、狀態、AI、自動策略 |
| [vectors.md](vectors.md) | 測試向量格式與移植驗收流程 |
