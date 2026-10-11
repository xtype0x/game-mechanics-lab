# Game Mechanics Lab（遊戲機制研究室）— 開發規則

計畫：`docs/PLAN.md`（v0.3）。核心規格：`docs/spec/`。

## 結構
- `packages/core`：規則核心。**純 TypeScript，禁止 DOM／Node API**（tsconfig 只引入 ES2022 lib）。只寫純函式：資料進、資料出。
- `packages/console`：機制模擬主控台（Vite + React）。只能透過 `@ggt/core` 的公開匯出使用核心。
- `packages/core/vectors/`：跨語言測試向量（由測試產生，提交進 git）。
- `docs/spec/`：權威規格。改變核心行為時，**同一個變更**要更新規格與向量。

## 指令（Windows 若找不到 node，先 `export PATH="/c/Program Files/nodejs:$PATH"`）
| 指令 | 用途 |
|---|---|
| `npm test` | 全部測試（含向量比對） |
| `npm run typecheck` | core 與 console 型別檢查 |
| `npm run dev` | 主控台開發伺服器 http://localhost:5173 |
| `npm run build` | 產生單檔 HTML：`packages/console/dist/index.html` |
| `npm run vectors` | 重新產生測試向量（核心行為**有意**改變時才用，並檢查 diff） |

## 核心可移植守則
1. 數值為 IEEE 754 double；運算順序必須與 `docs/spec/` 的公式一致。
2. 取整只用 `applyRounding`／`roundHalfAway`；不要用 `Math.round`。
3. 亂數只用 `Rng`，每個子系統用自己的 stream 名稱。
4. 規則資料中的公式一律是 `Expr` JSON 樹；不可存任意程式碼。
5. 新機制元件必須附手算預期值測試，並加入向量。

## 驗收
完成回報要列出：實際執行的指令與結果、未測項目、已知限制。UI 變更要用瀏覽器實際操作確認。
