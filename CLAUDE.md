# Game Mechanics Lab（遊戲機制研究室）— 開發規則

計畫：`docs/PLAN.md`（v0.3）。核心規格：`docs/spec/`。

## 結構（npm workspaces，套件前綴 `@gml/`）
| 層 | 位置 | 內容 |
|---|---|---|
| 共用函式庫 | `packages/core`（`@gml/core`） | 規則核心。**純 TypeScript，禁止 DOM／Node API**（tsconfig 只引入 ES2022 lib）。只寫純函式：資料進、資料出。 |
| | `packages/data-hsr`（`@gml/data-hsr`） | 星穹鐵道資料（角色、成長表、敵人、裝備）與轉成核心資料的純函式。依模組分開匯入（`/presets`、`/characters`、`/enemies`、`/equipment`），用不到的資料不會被打包進頁面。不含 React，也不讀寫瀏覽器儲存。 |
| | `packages/ui`（`@gml/ui`） | 共用 React 元件：基礎元件、戰鬥編輯器與模擬器、動畫戰鬥畫面（`@gml/ui/scene.css`、`demo.css`），以及小專案掛載契約 `MountProject`／`ProjectHost`。 |
| 小專案 | `projects/<id>`（`@gml/<id>`） | 一個工具或 DEMO 一個資料夾，例如 `gacha-sim`、`hsr-battle`。 |
| 宿主 | `apps/site`（`@gml/site`） | 公開網站外殼：首頁、遊戲頁，並依 `project.json` 自動產生每個小專案的頁面。 |
| | `apps/console`（`@gml/console`） | 內部機制主控台與試玩 DEMO，不公開。 |
| 其他 | `packages/core/vectors/` | 跨語言測試向量（由測試產生，提交進 git）。 |
| | `docs/spec/` | 權威規格。改變核心行為時，**同一個變更**要更新規格與向量。 |
| | `data/`、`scripts/` | 本機研究資料，以及產生資料的腳本。 |

### 依賴方向（只能往下依賴，不能反向，也不能橫向）
```
apps/site ──► projects/* ──► packages/ui ──────► packages/core
                         └─► packages/data-* ─► packages/core
apps/console ───────────────► packages/ui ──────► packages/core
```
- 小專案**不可** import 其他小專案或 `apps/*`；`apps/console` 不 import 小專案。
- 跨套件只能用套件名稱與 `package.json` 的 `exports`（例如 `@gml/data-hsr/presets`），**不可**用相對路徑伸進別的套件的 `src/`。
- 依賴一律宣告成 workspace 依賴（`"@gml/core": "*"`）。**不要**用 Vite alias 或 tsconfig `paths`，也**不可**複製別的套件的程式碼。
- `data/` 不進網站與小專案；研究資料只透過 `scripts/` 產生 `*.generated.json`，放進該遊戲的資料套件（例如 `packages/data-hsr/src/generated/`）。資料套件只依賴 core；瀏覽器儲存和畫面留在小專案。

## 機制與模組共用（避免日後大重構）
1. **遊戲機制一律寫在 `packages/core`**，附規格與向量，即使目前只有一個專案用到。小專案只放畫面、內容資料與組裝方式。新 DEMO 要「混用機制」時，應該是組合 core 既有的模組加上資料，而不是在專案裡另寫一套規則。
2. **兩處需要就提升（rule of two）**：程式先寫在小專案裡；當第二個專案或 App 也需要時，在**同一個變更**中搬到 `packages/`。規則邏輯搬到 `core`；React 元件搬到 `ui`；某款遊戲的共用資料放進 `packages/data-<game>`（已有 `data-hsr`）。不准複製一份過去，也不准跨專案 import。
3. **共用元件不帶宿主專屬的版面或導覽**。差異用 props、插槽（例如 `before`、`actions`）或 context（例如 `RefLinkProvider`）處理，宿主自己的外層包裝留在宿主裡。範例：console 的 `tools/battle/CharacterEditor.tsx` 包住共用的單一角色編輯器。
4. **改 packages 的公開介面時，同一個變更要修好所有使用者**。`npm run typecheck` 會檢查每個工作區。
5. 共用元件只用 class 名稱，編輯器的樣式由各宿主或專案自己的 CSS 負責；只有動畫戰鬥畫面與判定時間軸元件（`timing.css`）附帶自己的 CSS。

## 新增小專案（檢查清單）
1. 建立 `projects/<id>/`（`<id>` 用小寫英文加 `-`，資料夾名＝id＝套件名尾碼）：
   - `package.json`：`"name": "@gml/<id>"`、`"exports": { ".": "./src/index.tsx", "./project.json": "./project.json" }`、`dependencies` 列出用到的 `@gml/*`、`peerDependencies` 列 `react`／`react-dom`。
   - `project.json`：`id`、`title`、`description`、`path`（網址路徑，例如 `hsr/toughness-rpg`）、`back`（`{ route: "#/games/hsr", label: "…" }`）、`en`（`{ title, description, backLabel }`，英文版；有 `back` 就要有 `backLabel`）。
   - `tsconfig.json`：`{ "extends": "../../tsconfig.web.json", "include": ["src"] }`。
   - `src/index.tsx`：`export const mount: MountProject = (el, host) => …`。返回連結用 `host.back`（文字用 `localize(host.back.label, locale)`），不要寫死網站路徑。
   - `README.md`（做什麼、資料來源、瀏覽器儲存鍵）與 `test/`。
2. 在根目錄執行 `npm install`，把新套件連結進 workspace。
3. 把 `"@gml/<id>": "*"` 加進 `apps/site/package.json`，再執行 `npm run pages -w @gml/site` 產生頁面，並把產生的 `index.html` 提交進 git。`dev`／`build` 前也會自動重新產生。
4. 要出現在遊戲頁的話，在 `apps/site/src/content/games.ts` 加工具卡片。`apps/site/test/pages.test.ts` 會檢查連結是否存在、頁面是否為最新。
5. `npm run typecheck` 與 `npm test` 會自動納入新資料夾，不必改任何清單。

## 命名與相容性
- 瀏覽器儲存鍵：新專案用 `gml.<id>.<名稱>.v<版本>`；資料形狀改變時升版本號。既有的 `ggt.*` 鍵與檔案／分享格式名（`ggt-gacha-rules`、`ggt-reference-pack`）**永不改名**，否則訪客的存檔與分享連結會失效。
- 網址路徑一旦公開就視為不可改；必須改時，在 `apps/site/build/pages.mjs` 的 `STATIC_PAGES` 留一頁轉址頁（例如 `battle/`）。

## 指令（Windows 若找不到 node，先 `export PATH="/c/Program Files/nodejs:$PATH"`）
| 指令 | 用途 |
|---|---|
| `npm test` | 全部測試（含向量比對、網站頁面檢查），自動找出各工作區的 `test/` |
| `npm run typecheck` | 型別檢查每個有 `tsconfig.json` 的 `packages/*`、`apps/*`、`projects/*` |
| `npm run dev` | 主控台開發伺服器 http://localhost:5173 |
| `npm run build` | 產生單檔 HTML：`apps/console/dist/index.html` |
| `npm run site:dev` | 網站開發伺服器 http://127.0.0.1:5180 |
| `npm run site:build` | 建置網站到 `apps/site/dist/` |
| `npm run site:build:offline` | 離線單檔建置到 `apps/site/offline/` |
| `npm run gacha:snapshot` | 更新抽卡模擬器的卡池快照 |
| `npm run vectors` | 重新產生測試向量（核心行為**有意**改變時才用，並檢查 diff） |

## 核心可移植守則
1. 數值為 IEEE 754 double；運算順序必須與 `docs/spec/` 的公式一致。
2. 取整只用 `applyRounding`／`roundHalfAway`；不要用 `Math.round`。
3. 亂數只用 `Rng`，每個子系統用自己的 stream 名稱。
4. 規則資料中的公式一律是 `Expr` JSON 樹；不可存任意程式碼。
5. 新機制元件必須附手算預期值測試，並加入向量。

## 分工與 subagent（省 token）
主對話（Opus）負責設計、拆任務、審查與最後的驗收回報；範圍明確的工作交給 `.claude/agents/` 的 subagent，使用者沒另外說也照這個分工。
| Agent | 模型 | 交給它的工作 |
|---|---|---|
| `implementer` | sonnet | 設計已定、範圍明確的實作（附檔案清單與驗收條件） |
| `translator` | sonnet | 介面文字中英翻譯，照 `docs/i18n/glossary.md` |
| `mechanical-edit` | haiku | 規則清楚的批次修改、掃描列清單、跑指令整理結果 |
| `ui-verifier` | sonnet | 瀏覽器實際操作驗收（只回報不修改） |
| `spec-qa` | sonnet | 只看規格與向量的獨立 QA |
| 內建 `Explore` | — | 大範圍搜尋、只需要結論時 |
- 留在主對話做：架構與公開介面設計、core 規則與規格的取捨、術語決定、審查 subagent 的 diff。小到幾行的修改直接做，不要為了委派而委派。
- 任務描述要自足：目標、檔案範圍、要照的範例、驗收指令。subagent 看不到主對話。
- 同時最多 3 個，不遞迴；同一個檔案同一時間只有一個寫入者；平行實作用 worktree 隔離。
- 審查後若發現某個 agent 反覆犯同樣的錯，回報給使用者並建議怎麼改它的 `.claude/agents/<name>.md`。

## 驗收
完成回報要列出：實際執行的指令與結果、未測項目、已知限制。UI 變更要用瀏覽器實際操作確認。
