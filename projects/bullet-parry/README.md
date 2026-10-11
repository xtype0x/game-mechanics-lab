# 子彈格擋試玩（`@gml/bullet-parry`）

網站頁面 `bullet-parry/`（設定見 [project.json](./project.json)）。2D 側視小遊戲：玩家在左下，槍手在右邊射子彈；用格擋、閃避、技能撐越久越好。判定全部交給 `@gml/core` 的 `Timing`（規格 `docs/spec/timing.md`）。

```bash
npm run site:dev   # http://127.0.0.1:5180/bullet-parry/   （加 ?debug 會在 window.__bp.session() 暴露目前的 session，供手動 QA）
```

## 玩法與操作
| 互動 | 鍵 | 說明 |
|---|---|---|
| 格擋 | J / 空白 | 子彈碰到身前虛線的瞬間按；完美時機把子彈反彈打槍手（硬直＋加分），紅色不可格擋彈無效 |
| 閃避 | K / Shift | 有充能（預設 2 次、每 3 秒回 1 次）；窗口內所有子彈穿過；完美閃避觸發慢動作 |
| 技能 | L / E | 量表滿（100）才能用，無敵 4 秒；完美格擋／閃避累積量表 |

Esc 或 P 暫停；切走分頁會自動暫停。按鍵可在設定逐一重設（存在設定裡；重設後取代該互動的預設鍵與備用鍵，Esc／P／Enter／Tab 為保留鍵），標題與暫停畫面都會列出目前按鍵。畫面下方的按鈕是由 `config.interactions` 產生的觸控按鈕（名稱、按鍵提示、充能點、量表進度）。**遊戲不寫死格擋／閃避邏輯**：它只遍歷互動資料；使用者新增的互動（例如「互動展示」預設的看破／跳躍／吸收）會自動出現按鈕，按鍵取 `InteractionDef.key`。

分數 = 存活秒數 ×10 + 完美次數 ×50。生命 = `res.hp`，量表 = `res.gauge`，充能來自 `state.charges`。

## 架構
- `src/game/`：**純 TS、無 DOM、固定 60 Hz**。`world.ts`（一幀 `stepWorld`：導演 → 子彈 → `Timing.stepTiming` → 依事件反應；練習模式在這裡補血）、`director.ts`（難度曲線與彈幕樣式）、`session.ts`（頓幀與慢動作的時鐘、按鍵佇列、每步寫入判定紀錄）、`judge.ts`（固定容量環形緩衝：最近 240 幀的 trace／事件／撞擊，以及來彈撞擊幀預測）、`keys.ts`（按鍵對應與重設）、`rules.ts`（驗證閘門、預設比對、最佳分數策略）、`hud.ts`（HUD 模型）、`config.ts`（子彈種類表、導演參數、練習模式參數）、`preset.ts`（遊戲預設判定）。
- `src/judge/` + `src/JudgePanel.tsx`：判定幀數條。`model.ts` 把環形緩衝轉成可繪製的區段（重用 `@gml/ui` 的 `actionSpans`／`pressMarks`／`describeEvent`），`strip.ts` 以輕量 canvas 畫出；紀錄文字是 DOM。沒有直接嵌 `FrameBar`／`TimingLog`，因為它們帶縮放工具列與篩選，遊戲內只需要一條緊湊的唯讀視圖。
- `src/render/`：Canvas 2D。`fx.ts` 是程序化特效（粒子上限 300、衝擊環、彈出文字、暈邊、震動；原地壓縮陣列避免每幀配置），`procedural.ts` 含視差背景（天空／雲／三層天際線，未上傳 `background` 時使用）。尊重 `prefers-reduced-motion`（震動與閃光縮小、背景與光環不再轉動）。`slots.ts` 是**素材槽登錄表**，`drawSlot(ctx, slotId, x, y, w, h, t)` 先找已登錄的圖片／影格條，沒有就用 `procedural.ts` 的預設圖形。槽 id：`player.idle`、`player.hurt`、`player.skill`、`player.<互動 id>`（後備 `player.action`）、`gunner.idle|shoot`、`bullet.<種類>`、`background`、`screen.title`、`screen.gameOver`；`listSlots(config)` 列出全部。
- `src/audio/`：`events.ts`（音效槽與純函式 `soundsForEvents`：遊戲事件 → 音效 id）、`synth.ts`（WebAudio 合成的預設音效，repo 不含音檔）、`engine.ts`（AudioContext、主音量／靜音、相同音效節流 50–120 ms、上傳音檔取代預設）。
- `src/assets/`：`pack.ts`（素材包格式與驗證，純函式）、`db.ts`（IndexedDB 薄封裝，全程 try/catch）、`store.ts`（素材包管理、把使用中的包套用到 SlotRegistry 與 AudioEngine；圖片解碼成 ImageBitmap 並在替換時 close，不建立 object URL）。
- `src/App.tsx`：標題／遊戲中／結束畫面、暫停、設定面板、觸控按鈕。

### 反應規則（遊戲如何讀 `Timing` 事件）
一次 `resolve` 事件加上同結果的 `effect` 事件合成一次「結算」：
- `via: hit` → 子彈消失、扣血、震動；`via: invulnerable` → 子彈被護盾擋掉。
- `cue reflect` → 子彈往右上方彈飛出畫面（途中會抵銷其他來襲的子彈）。槍手不受玩家任何行動影響，`cue attackerStagger` 在本遊戲中不使用。
- 帶 `damage` 的結果（如破防）→ 視為受傷。`cue pass` 或沒有 hitstop 的結果 → 子彈穿過（閃避類）；有 `hitstop`、`cue destroy`、`vfx:absorb*` → 子彈被消耗。
- `hitstop` 凍結世界 N 個真實幀；`timeScale` 以 scale 倍速推進 N 個真實幀；`anim:hurt`／`anim:guardBroken` 讓玩家顯示受傷姿勢；`vfx:*` 產生特效圈。按鍵先排隊，下一個世界幀才送入。

### 難度
全部在 `src/game/config.ts` 的 `DIRECTOR`（起始間隔 190 幀、下限 62、每 30 秒 ×0.88、子彈速度每 30 秒 +4.5% 上限 ×1.4）、`OPENING`（前 30 秒子彈速度從 ×0.82 漸增到 ×1）與 `src/game/director.ts` 的 `PATTERNS`。前 30 秒只出單發（0 s）、間隔寬鬆的瞄準雙發（16 s，兩發相隔 34–46 幀）與低空彈（24 s），之後才進入原本的爬升：紅彈 30 s → 能量彈 36 s → 彈跳齊射 44 s → 密集連射 55 s → 變速佯攻 65 s → 混合彈幕 80 s。每發子彈開火前槍口會依種類發光（一般 36 幀、紅彈 46 幀）。

**難度倍率＝節奏**（0.5–3，分階：輕鬆 0.5、普通 1、困難 1.5、地獄 2、修羅 2.6）。倍率 d 不改變子彈速度，而是：導演時鐘以 d 倍前進（`directorSeconds`），所以上面的解鎖時間、間隔爬升、開局緩和期都縮短為 1/d；兩次出招的間隔再除以 d（絕對下限 `floorInterval` 22 幀）；同一招內的子彈間隔乘 1/√d，但相鄰兩發至少隔 10 幀（`MIN_SHOT_GAP`，原本就比較近的不再縮）；密集連射、彈跳齊射、混合彈幕每高 0.5 多 1 發（各有上限）。修羅級（≥ 2.6）另有「交錯彈幕」：一般彈與紅彈交替四發，逼玩家格擋與閃避輪流切換。亂數用 `Rng`，stream：`bullet-parry.director`、`bullet-parry.aim`。

**練習模式**（設定頁勾選）：生命無限（每幀把生命補滿並撤銷敗北；受傷的回饋照舊）、子彈速度 ×0.7、彈幕間隔放寬 25%，結算畫面標示練習且**不存最佳分數**。

## 自訂素材包（圖片＋音效）
標題、暫停選單的「素材」按鈕開啟素材管理畫面；標題與暫停選單有素材包下拉與 ⇄ 快速切換（預設素材 ⇄ 上次選的自訂包），遊戲中左下角的「素材：…」按鈕也可切換，立即生效。**素材只存在你的瀏覽器，不會上傳到任何伺服器。請只使用你有權使用的圖片與音效。**

- 圖片槽：上面列的 id；PNG／JPG／WebP／GIF（GIF 只取第一格）。每槽可設影格數（>1 視為由左至右等分的水平影格條）、fps、縮放、偏移 X／Y；預覽框以虛線標示繪製框。角色／槍手／子彈以「等比縮放放進框內」，`background` 拉伸，`screen.*` 等比鋪滿（cover）。自訂互動會自動出現 `player.<id>` 槽。
- 音效槽：`sfx.hit`（被打中）、`sfx.parry`（格擋）、`sfx.perfect`（完美）、`sfx.dodge`（閃避，結果帶 pass cue）、`sfx.skill`（技能）、`sfx.fire`（槍手開火）、`sfx.gameOver`（遊戲結束）。預設是合成音；每槽可上傳音檔並調音量（0–200%）。主音量與靜音在設定與素材畫面。瀏覽器需先有一次點擊／按鍵才會出聲。
- 素材包：建立／重新命名／複製／刪除（有確認）。匯出為單一 `<名稱>.bppack.json`（圖片與音效以 data URL 內嵌），格式 `{ format: "gml-bullet-parry-pack", version: 1, name, images: { [槽 id]: { dataUrl, frames?, fps?, scale?, offsetX?, offsetY? } }, sounds: { [槽 id]: { dataUrl, volume? } } }`。匯入會驗證 format／version，單檔上限 8 MB、整包 30 MB，只收 PNG／JPG／WebP／GIF 與 audio/*，錯誤以中文顯示。
- 沒有 IndexedDB 時（例如部分無痕模式）遊戲照常使用預設素材，素材管理畫面會提示上傳的素材只在本次使用中有效。

## 資料來源
判定規則來自 `Timing.TIMING_PRESETS`；遊戲預設 `bullet-parry-default`（`src/game/preset.ts`）由「寬鬆」複製調整：閃避 2 充能、技能耗 100 量表、閃避結果加 `pass` cue、完美格擋給 30 量表。設定頁的「載入預設」＝遊戲預設＋全部核心預設（內容被改過會顯示「已修改」），下方有完整的 `TimingEditor`（可收合）、匯出／匯入 `gml-timing-config` JSON（`exportTimingConfig`／`parseTimingConfig`）、驗證結果。**驗證錯誤會停用「開始遊戲」並顯示原因；警告不擋**。編輯器新增的互動立刻能玩：按鈕、按鍵（`InteractionDef.key`，也可在設定重設）、HUD 就緒狀態與 `player.<id>` 素材槽都由資料產生。規則有錯時標題背景會暫時用遊戲預設跑，不會當機。

### 判定幀數條
設定勾選「顯示判定幀數條」後，遊戲畫面下方（舞台之外，不遮畫面）顯示最近 2 秒＋未來 0.7 秒：來彈撞擊點（依子彈種類上色，空心＝預測）、每個互動的啟動／判定窗／收招、按鍵標記（白＝接受、黃＝緩衝、紅＝丟棄）、結算菱形（金＝完美、綠＝成功、紅＝失敗）、硬直／無敵條，加上最近 8 行滾動紀錄。紀錄存在 session 的環形緩衝（240 幀，超過就覆蓋，不會無限成長）。勾選「暫停時凍結」時，暫停後出現滑桿可往回看最多 2 秒（總共 4 秒）。

## 瀏覽器儲存鍵
- `gml.bullet-parry.best.v1`：最佳分數。
- `gml.bullet-parry.settings.v1`：`{ config: TimingConfig, difficulty, showFrameBar, packActive, packLast, volume, muted, practice, judgeFreeze, keys }`（`keys` 是 `{ 互動 id: KeyboardEvent.code }`；後面幾個欄位是後來加的，舊存檔缺少時用預設，所以沒有升版。結構完整但驗證不過的規則會保留，讓玩家能在編輯器修好；結構殘缺才退回預設）。
- IndexedDB `gml.bullet-parry.assets.v1`：物件庫 `packs`（keyPath `id`），每筆是一個素材包，圖片與音效以 Blob 存放。

## 測試
`test/game.test.ts`：子彈抵達幀、完美格擋反彈與命中槍手、不可格擋彈扣血、閃避穿過與充能回復、技能無敵、三次受傷結束、頓幀與慢動作時鐘、導演以固定種子逐步解鎖。
`test/assets.test.ts`：素材包驗證（好檔、錯誤 format／version、超大、不接受的 MIME）、匯出再匯入、遊戲事件 → 音效 id 對應、設定舊存檔相容。IndexedDB／WebAudio 部分未做單元測試，靠瀏覽器手動驗證。
`test/polish.test.ts`：環形緩衝與 JudgeLog 有界、一次格擋寫入的按鍵／撞擊／結算與幀條模型、撞擊幀預測（含變速彈）、按鍵重設解析與衝突、練習模式（補血、速度、不存最佳）、前 30 秒難度、驗證閘門與預設比對、自訂互動可按且有素材槽、設定存檔相容。
