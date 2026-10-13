# 星穹鐵道資料（`@gml/data-hsr`）

星穹鐵道的角色、敵人與裝備資料，以及把它們轉成核心規則資料的純函式。只依賴 `@gml/core`，不含 React、不讀寫瀏覽器儲存，任何小專案或 App 都可以用。2026-10-11 由 `projects/hsr-battle` 提升為共用套件，讓之後的研究專案（例如角色強度與成長曲線）也能用同一份資料。

## 模組（各自獨立匯入，用不到的資料不會被打包進頁面）
| 匯入路徑 | 內容 |
|---|---|
| `@gml/data-hsr/presets` | 98 位角色的 Lv80 單位（`hsrGroup`），以及 `Preset`、`PresetGroup` 型別。目前 11 位可用，其餘附上尚缺的規則模組。 |
| `@gml/data-hsr/characters` | 原始角色資料：各突破階段的成長表與每個技能等級的參數。提供 `hsrStatsAt(id, 等級, 突破?)`、`hsrSkillParams(id, 技能 id, 技能等級)`、`HSR_PRESET_LEVEL`（80）與 `HSR_PRESET_SKILL_LEVELS`。 |
| `@gml/data-hsr/enemies` | 10 組敵人遭遇（Lv 60／70／80），以及 `applyHsrEncounter`、`currentHsrEncounter`。 |
| `@gml/data-hsr/equipment` | 光錐、遺器、行跡資料。`buildLoadout`、`compileUnit`、`compileProject` 把配裝選擇轉成核心的 `Loadout`（`docs/spec/loadout.md`）；另有 `sanitize`、配裝範本等。 |
| `@gml/data-hsr/generated/*` | 產生出來的 JSON 原檔（例如網站進度頁以動態 import 讀 `presets.generated.json`）。 |

**`presets` 與 `characters` 的關係**
- `presets` 是由 `characters` 在 Lv80、指定技能等級下組出來的。
- 測試 `test/characters.test.ts` 會檢查：用成長表重新計算 Lv80 的結果，必須和預設角色的數值完全相同。
- 預設角色的技能倍率寫在手寫的角色機制檔（`data/reference/hsr/kits/*.json`），倍率是固定在特定技能等級的數字。要研究其他技能等級時，請用 `hsrSkillParams`。

## 產生資料（`src/generated/`，不要手改）
| 指令 | 產生 |
|---|---|
| `node scripts/build-hsr-presets.mjs` | `presets.generated.json`、`characters.generated.json`（並自動驗證） |
| `node scripts/build-hsr-encounters.mjs` | `enemies.generated.json`（並自動驗證） |
| `node scripts/build-hsr-equipment.mjs` | `equipment.generated.json` |

輸入檔是本機研究資料：`data/reference/hsr/`（未提交的第三方快照）與 `docs/research/hsr-kit/catalog.json`。產生器的輸出是確定性的，同樣的輸入會得到完全相同的檔案。

## 資料來源與限制
- 角色與裝備資料來自 StarRailRes 快照（上游標示版本見 `characters.generated.json` 的 `source.version`）；敵人資料來自 KQM 社群資料。兩者都是未核實的社群整理，不保證與正式服相符。
- 敵人的技能倍率、AI 與狀態數值多為標示【佔位】的估計值，韌性換算（×1/3）也未核實。
- 尚未包含角色的實裝版本或日期。
- 遊戲內容著作權屬於 HoYoverse，本專案與其無關。

## 授權
本套件的**程式碼**依 repo 根目錄的 MIT 授權（[LICENSE](../../LICENSE)）。`src/generated/` 裡的遊戲內容（角色名稱、技能描述、數值表等）**不在 MIT 授權範圍內**，屬 HoYoverse 所有，只為非商業的模擬與研究而收錄；權利人要求移除時會配合處理。資料整理來源：[StarRailRes](https://github.com/Mar-7th/StarRailRes)（角色、裝備；上游 AGPL-3.0，衍生檔案依該授權提供）與 [KQM SRL](https://github.com/KQM-git/SRL)（敵人；上游無授權檔案，不宣告授權）。每個 generated 檔案的來源修訂與授權處理見 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)；更新資料時同一個變更要更新該檔。
