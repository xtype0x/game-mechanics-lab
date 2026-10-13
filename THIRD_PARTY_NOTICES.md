# Third-party notices（第三方來源與授權）

本專案自寫的程式碼採 [MIT](LICENSE)。下列第三方內容**不在 MIT 範圍內**，各自的來源、固定修訂與授權處理如下。這份清單是來源與授權的整理，不是法律意見；權利人要求修正或移除時會配合處理。

Code written for this project is MIT-licensed. The third-party content below is **not** covered by the MIT license; each entry lists its source, pinned revision and how its license is handled. This is a record of sources, not legal advice; we will correct or remove content on request from a rights holder.

## 1. 遊戲內容：崩壞：星穹鐵道（HoYoverse）

- 內容：角色、技能、光錐、遺器、敵人的名稱、描述文字與數值表。
- 權利人：HoYoverse（COGNOSPHERE PTE. LTD.）。本專案與 HoYoverse 無關，也未獲其背書。
- 處理：只為非商業的模擬與研究而收錄；這不是權利人給予的再散布許可，任何上游授權也不會改變遊戲內容本身的權利。
- 位置：`packages/data-hsr/src/generated/`、`data/reference/hsr/kits/`。

Game names, character and skill text and numeric tables from Honkai: Star Rail are the property of HoYoverse (COGNOSPHERE PTE. LTD.). They are included only for non-commercial simulation and research. No upstream license below grants rights to that game content.

## 2. StarRailRes（Mar-7th/StarRailRes）

- 來源：https://github.com/Mar-7th/StarRailRes
- 固定修訂：[`dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`](https://github.com/Mar-7th/StarRailRes/commit/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487)（上游標示版本 4.6.0，未核實為正式服版本）
- 上游授權：GNU AGPL-3.0，全文複本：[licenses/StarRailRes-AGPL-3.0.txt](licenses/StarRailRes-AGPL-3.0.txt)
- 使用內容：上游整理的角色基礎數值與成長表、技能倍率與技能描述、光錐與遺器屬性表，經 `scripts/` 轉換成下列檔案：

| 檔案 | 內容 | 產生腳本 |
|---|---|---|
| `packages/data-hsr/src/generated/characters.generated.json` | 角色數值與技能 | `scripts/build-hsr-presets.mjs` |
| `packages/data-hsr/src/generated/presets.generated.json` | 角色預設 | `scripts/build-hsr-presets.mjs` |
| `packages/data-hsr/src/generated/equipment.generated.json` | 光錐、遺器屬性 | `scripts/build-hsr-equipment.mjs` |
| `data/reference/hsr/kits/*.json`（`implemented.json` 除外） | 技能參數與描述文字（取自上游技能描述） | 手動整理 |

- 授權處理：上述檔案來自 AGPL-3.0 的上游整理成果，**以上游授權適用的範圍為限，這些檔案依 AGPL-3.0 提供**，不採 MIT；其中的遊戲內容仍屬 HoYoverse（見第 1 節）。原始快照（`data/reference/hsr/snapshots/`）不提交進 repo，只保留固定修訂以供追溯。上游授權是否延伸到使用這些資料的自寫程式碼，本專案未作結論；自寫程式碼仍以 MIT 提供。

Files derived from the StarRailRes compilation are provided under AGPL-3.0 to the extent the upstream license applies to them, not under MIT. The game content inside them remains HoYoverse's.

## 3. KQM Star Rail Library（KQM-git/SRL）

- 來源：https://github.com/KQM-git/SRL
- 固定修訂：[`de0e5c09c8dbba9577367ad86e991fe91c4f0e36`](https://github.com/KQM-git/SRL/commit/de0e5c09c8dbba9577367ad86e991fe91c4f0e36)（2025-11-04，適用遊戲版本未確認）
- 上游授權：擷取時該修訂**沒有授權檔案**，再利用條款未確認。
- 使用內容：敵人的屬性、弱點、抗性、韌性與等級曲線數值，經 `scripts/build-hsr-encounters.mjs` 轉換成 `packages/data-hsr/src/generated/enemies.generated.json`。技能倍率、AI 與狀態數值是本專案的佔位估計，不是來源資料。
- 授權處理：因為沒有授權條款，本專案**不對這些數值宣告任何授權**，也不把它們納入 MIT；只註明來源。上游或權利人要求時會移除或替換。

KQM SRL had no license file at the pinned revision, so no license is claimed for the enemy values derived from it; they are attributed here and will be removed on request.

## 更新規則

新增或更新第三方來源時，同一個變更要更新本檔：來源、固定修訂、上游授權（含全文複本，如有）、使用內容、產生的檔案。`LICENSE`、根 `README.md` 與資料套件 README 只簡述並連到本檔。
