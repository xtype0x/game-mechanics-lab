# 網站中英切換（i18n）計畫 v0.1

狀態：第 1 階段完成（2026-10-12），下一步第 2 階段。
已知限制：靜態 HTML 外殼是中文，英文訪客載入瞬間會先看到中文分頁標題，React 掛載後才換成英文。範圍：公開網站 `apps/site` 與它掛載的小專案。`apps/console` 是內部工具，不做。

## 現況（2026-10-12 掃描）
含中文字串的行數（含註解，實際介面字串少一些）：

| 位置 | 檔案 | 行 | 備註 |
|---|---|---|---|
| `apps/site/src` | 5 | 77 | 首頁文案、導覽、關於、隱私頁；`project.json` 的 title／description／back.label |
| `projects/gacha-sim` | 15 | 325 | |
| `projects/bullet-parry` | 19 | 204 | |
| `projects/hsr-battle` | 8 | 94 | |
| `projects/timing-lab` | 6 | 84 | |
| `packages/ui` | 13 | 524 | 戰鬥編輯器、模擬器、判定時間軸 |
| `packages/data-hsr` | 3 | 22 | 角色／敵人名稱 |
| `packages/core` | 23 | 646 | `BattleError` 等錯誤訊息、戰鬥紀錄文字直接寫中文 |

## 設計決定（建議）
1. **語言**：`zh-Hant`（預設、原文）與 `en`。型別上用 `Locale = 'zh-Hant' | 'en'`，日後可再加。
2. **不引入 i18n 函式庫**。每個套件自己有 `src/i18n/zh-Hant.ts`（原文，定義 key 的形狀）與 `en.ts`（`satisfies` 同一型別），TypeScript 保證 key 一致、漏翻會編譯失敗。值可以是字串、`(params) => string`，或需要換行／強調的地方回傳 JSX 的函式。
3. **共用的語言狀態放 `@gml/ui/i18n`**（網站與所有小專案都要用，符合 rule of two）：
   - `getLocale()`：順序為網址 `?lang=` → localStorage → `navigator.language`（`zh*` → `zh-Hant`，其他 → `en`）。
   - `setLocale()`：寫入 localStorage 鍵 **`gml.site.locale.v1`**，同步 `<html lang>`，通知訂閱者。網站與小專案同源，所以切一次全站生效。
   - `useLocale()`、`useDict(dicts)`、`<LanguageSwitch/>`（只帶 class，樣式由宿主負責）。
   - 語言狀態是模組層級的 store（`useSyncExternalStore`），不需要 Provider。各自掛載的 React root 會同步；其他分頁切換時透過 `storage` 事件同步。
   - 數字與百分比用 `Intl.NumberFormat(locale)`。現有 `@gml/ui` 的 `fmt` 寫死 `zh-TW`，第 2 階段改成依語言。
4. **網址**：網站尚未公開，目前不做 `/en/` 靜態頁；先支援 `?lang=en` 讓分享連結可指定語言。正式上線前若要英文 SEO，再讓 `pages.mjs` 產生 `/en/...` 頁（見「之後」）。
5. **`project.json`** 增加 `"en": { "title", "description", "backLabel" }`；`pages.mjs` 驗證必填（全部專案補齊後才改成必填）。產生的 HTML 仍以中文為 `<title>`／meta，執行時依語言改 `document.title`。
6. **`ProjectHost.back`**：label 改成 `{ 'zh-Hant': string; en: string }`，由專案依目前語言顯示（改公開介面 → 同一變更修好所有專案）。
7. **core 不放翻譯**。core 的錯誤與戰鬥紀錄改成回傳 `{ code, params }`，由 UI 格式化成各語言。這會改變 core 輸出與向量，所以獨立成第 3 階段，規格與向量同一變更更新。在那之前，英文模式下核心錯誤訊息仍顯示中文。
8. **遊戲資料名稱**：`data-hsr` 的角色／敵人／裝備加 `nameEn`（官方英文名），不依賴 ui。
9. **防漏翻測試**：每個套件一個測試，掃 `src/`（排除 `i18n/` 與註解）裡的中文字串，有就失敗；遷移中的套件先列在允許清單，遷移完移除。
10. **英文語氣**：不是逐字翻譯，照 `docs/i18n/glossary.md` 的語氣規範意譯；標語可以重寫。

## 階段與分工
主對話（Opus）＝設計／審查；其餘照 `CLAUDE.md` 的 subagent 分工。

| 階段 | 內容 | 誰做 |
|---|---|---|
| 0 | 確認本文件的設計決定、術語表初稿 | 主對話 + 使用者 |
| 1a | `@gml/ui/i18n` 模組、`LanguageSwitch`、單元測試 | `implementer`（主對話先寫好 API 簽名） |
| 1b | 網站外殼：`main.tsx`／`content/*`／`pages/*` 抽成 `apps/site/src/i18n/zh-Hant.ts` | `implementer` |
| 1c | 網站英文字典 | `translator` → 主對話審語氣 |
| 1d | 頁首放語言切換、`project.json` 的 `en` 欄位、`ProjectHost` 改型別 | `implementer`；`project.json` 補欄位用 `mechanical-edit` |
| 1e | 瀏覽器驗收（兩種語言 × 桌面／手機） | `ui-verifier` |
| 2 | 各小專案與 `packages/ui` 字串抽出 + 英文（一個專案一個任務，可平行、用 worktree） | 掃描：`mechanical-edit`；抽字串：`implementer`；翻譯：`translator`；驗收：`ui-verifier` |
| 3 | core 訊息改 `{ code, params }`、更新規格與向量；`data-hsr` 英文名 | 設計：主對話；實作：`implementer`；`spec-qa` 審規格 |

每階段結束：`npm run typecheck`、`npm test`、`npm run site:build` 都要過，才進下一階段。

## 已決定（2026-10-12，使用者）
- 英文版意譯，標語可重寫；預設語言依瀏覽器；上線前不做 `/en/` 靜態頁。術語表初稿通過。
- 英文文案之後由使用者自己調整。「關於計畫」等敘事頁的英文版可能整篇重寫（原文是對台灣讀者說的），部分段落英文版可能不顯示。
  → 字典允許 `en` 的某個 key 是 `null`（元件就不顯示該段）；敘事頁可以每個語言各寫一個內容模組，不必逐 key 對應。
- 第 1 階段先把現有中文抽成字典，英文照目前文本翻；文案重寫不影響進度。

## 之後
- `/en/` 靜態頁：`pages.mjs` 對每頁多產生一份 `lang="en"` 的 HTML，加 `hreflang` 互指。
- 簡體中文：加 `zh-Hans` 字典即可；可考慮由 `zh-Hant` 自動轉換後人工校對。
