# timing-lab（格擋閃避判定研究室）

逐幀模擬「在特定幾幀內按下按鍵」的判定：左側編輯規則（互動、判定窗、結果表、效果），中間是程序繪製的動作場景、幀數條與判定紀錄。

- **規則來源**：`@gml/core` 的 `Timing`（`docs/spec/timing.md`）。預設設定是 `Timing.TIMING_PRESETS`；格擋、閃避只是互動資料，可以新增自己的互動。
- **共用元件**：`@gml/ui` 的 `TimingEditor`、`FrameBar`、`TimingLog`（樣式 `@gml/ui/timing.css`）。
- **本專案自己的部分**：招式庫與序列排程（`attacks.ts`）、場景（`Scene.tsx`）、播放與頓幀／慢動作（`usePlayback.ts`）、統計（`stats.ts`）、按鍵腳本與儲存（`session.ts`）。
- **即時模式**：按下互動的 `key` 提示鍵（例如 KeyJ）或畫面按鈕，按鍵記錄在「下一幀」；**回放模式**以腳本重現同一個情境。
- **瀏覽器儲存鍵**：`gml.timing-lab.config.v1`（規則設定）、`gml.timing-lab.session.v1`（招式庫、序列、按鍵腳本）。壞掉的存檔會退回預設。
- 設定可匯出／匯入為 JSON（`format: "gml-timing-config"`）。
