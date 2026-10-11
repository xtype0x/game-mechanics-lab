# 測試向量

位置：`packages/core/vectors/`。JSON 格式，與語言無關。

| 檔案 | 內容 |
|---|---|
| rng.json | `cases`：每組 (seed, stream) 的前 16 個 uint32。`derived`：在同一個產生器上依序呼叫 next／chance／int 的結果 |
| expr.json | `cases`：文字、JSON 樹、在 `variables` 下的值。`errors`：求值必須失敗的 JSON 樹 |
| damage.json | `components`、`templates`：內建定義。`cases`：輸入（config、scenario）與預期輸出；`m6/` 開頭的案例來自只用資料擴充的範例專案。`compat`：組合設定與預期狀態、錯誤數、警告數 |
| battle.json | `timeline`：速度 → 行動順序預測。`battles`：完整輸入（damageConfig、battle、seed）與自動戰鬥（§7.3 策略）結束時的狀態與完整事件紀錄。`ext/` 開頭的案例涵蓋 battle.md §13 的所有擴充事件；`ext/dream-seed-19` 涵蓋 §14（`allyHit`、`target.*` 條件、`battle.count`、支配、行動條事件倒數）與 §15.1、§15.3；`ext/dream-pair-seed-40` 以 §15.2 受控判負結束；`v09/` 開頭的案例涵蓋 §16（`v09/formulas-seed-5`：表達式數值、`when`／`chance`（proc 流）、`hpCost`、`onHit` 與 `victim`、`statusAdjust`、`battleStart`／`action`／`allyDamaged` 被動；`v09/triggers-seed-23`：`unitEnter`／`unitLeave`／`revived`、有 `actorDefId` 的 `action`、標籤驅散；`v09/marks-seed-31`：以 `statusAdjust` 消耗標記、`battle.holders`）；`v10/regen-innate-seed-5` 涵蓋 §17（開場狀態疊層、速度修正反映在第一次行動值、自身護盾、`energyRegen`） |

| gacha.json | `banners`：三個卡池（DEMO 簡易池、限定池、手算用的 mini 池）。`pulls`：每個卡池、兩個種子（亂數流 `gacha.pulls`）的逐抽結果與最終狀態。`distributions`：目標的抽數分布 `pmf`、`mean`、`tail` 與保證上限 `worstCase`。`longRun`：各稀有度長期比例。`disclosure`：機率公示表。分析結果容許誤差見 `tolerance`（gacha.md §4） |
| gacha2.json | `models`：三個預設與一個所有模組並用的組合模型。`pulls`：逐抽結果（亂數流 `gacha2.pulls`，每 50 抽嘗試一次兌換）與最終狀態。`contexts`：`pullContext`。`distributions`：各種目標（含起始進度、不兌換）的 pmf、mean、tail、保證上限、變異數與百分位。`copies`：150 抽後的份數分布。`longRun`。`cost`：儲值表、購買組合、`currencyFor`、`spend`。容許誤差見 `tolerance` |
| loadout.json | `unit`、`projectStatuses`。`cases`：`applyLoadout` 的輸入配裝與預期的單位與狀態（空配裝、完整配裝、件數不足、只有百分比／固定的鍵）。`validation`：`validateLoadout` 的預期問題清單（`level:message` 的順序即輸出順序） |
| timing.json | `version`、`presets`：五個內建設定。`cases`：完整設定（`config`，不需移植預設）、腳本 `script`（`frames`、`presses`、`attacks`）與預期的 `events`（完整事件序列）和 `final`（最終 `TimingState`）；涵蓋判定窗邊界、傷害與破防、防連打與鎖定、緩衝、充能（sequential／parallel）、慢動作與返還充能、`inputOffset`、技能無敵、自訂互動、敗北。`conversions`：`msToFrames`／`framesToMs`。`expand`：`expandAttack` |
| modules.json | `modules`：DEMO 模組定義。`cases`：各種開關組合與 `resolveModules` 的結果（docs/demo-modules.md） |

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
