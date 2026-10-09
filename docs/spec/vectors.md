# 測試向量

位置：`packages/core/vectors/`。JSON 格式，與語言無關。

| 檔案 | 內容 |
|---|---|
| rng.json | `cases`：每組 (seed, stream) 的前 16 個 uint32。`derived`：在同一個產生器上依序呼叫 next／chance／int 的結果 |
| expr.json | `cases`：文字、JSON 樹、在 `variables` 下的值。`errors`：求值必須失敗的 JSON 樹 |
| damage.json | `components`、`templates`：內建定義。`cases`：輸入（config、scenario）與預期輸出。`compat`：組合設定與預期狀態、錯誤數、警告數 |

### damage.json `cases[].expected`
| 欄位 | 意義 |
|---|---|
| stepOrder | composeRules 後的步驟 ID 順序 |
| critChance | p |
| nonCrit / crit | `total` 與 `hits[]`；每段有 `damage` 與 `steps`（步驟 ID → 步驟值） |
| expected | 期望值 |
| distribution | `[{value, prob}]`，依 value 遞增 |
| sample | 以 `seed` 抽樣 `n` 次的總傷害序列（damage.md §4.3 抽樣規則） |

## 移植驗收流程
1. 依 `docs/spec/` 實作目標語言版本。
2. 讀取向量檔，逐一執行：
   - 整數與取整後的傷害必須**完全相等**。
   - 步驟值、期望值、機率允許相對誤差 1e-12（不同語言的 `pow`/格式化差異）。
3. 全部通過才算完成；失敗時回報向量 `id`。

## 更新
核心行為若有意改變：執行 `npm run vectors` 重新產生，並在提交說明中寫明改變了什麼。向量差異即是對下游移植的破壞性變更通知。
