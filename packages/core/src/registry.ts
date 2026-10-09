/**
 * Tool catalog. Tool IDs are stable; renames keep the ID. The console renders the list from this data.
 */

export type ToolStatus = "available" | "experimental" | "researching" | "planned";
export type TimeModel = "static" | "turn-based" | "probability";

export interface ToolEntry {
  id: string;
  name: string;
  summary: string;
  category: "damage" | "gacha" | "action" | "status" | "character" | "enemy" | "growth" | "simulation";
  tags: string[];
  timeModel: TimeModel;
  status: ToolStatus;
  milestone: string;
  aliases?: string[];
}

export const CATEGORY_LABELS: Record<ToolEntry["category"], string> = {
  damage: "傷害",
  gacha: "抽卡",
  action: "行動與資源",
  status: "弱點與狀態",
  character: "角色與技能",
  enemy: "敵人與關卡",
  growth: "成長與經濟",
  simulation: "模擬與分析",
};

export const STATUS_LABELS: Record<ToolStatus, string> = {
  available: "可用",
  experimental: "實驗中",
  researching: "研究中",
  planned: "規劃中",
};

export const TIME_MODEL_LABELS: Record<TimeModel, string> = {
  static: "純計算",
  "turn-based": "回合制",
  probability: "機率",
};

export const TOOLS: ToolEntry[] = [
  { id: "damage.breakdown", name: "傷害計算與分項檢視", summary: "輸入攻守雙方與技能，逐乘區展開每個數字的來源，並比較兩套方案。", category: "damage", tags: ["傷害", "乘區", "A/B"], timeModel: "static", status: "available", milestone: "M2", aliases: ["傷害計算器", "damage calculator"] },
  { id: "damage.composer", name: "乘區組合器", summary: "自由挑選、改寫、新增傷害乘區，即時檢查組合是否相容。", category: "damage", tags: ["傷害", "公式", "相容性"], timeModel: "static", status: "available", milestone: "M2", aliases: ["公式編輯器", "formula"] },
  { id: "damage.crit-dist", name: "暴擊分布分析", summary: "多段命中各自判定暴擊時，總傷害的精確分布與抽樣比較。", category: "damage", tags: ["傷害", "暴擊", "機率"], timeModel: "probability", status: "available", milestone: "M2", aliases: ["暴擊期望"] },
  { id: "gacha.pool-editor", name: "卡池與保底規則編輯器", summary: "設定機率、軟硬保底、大小保底與跨池繼承。", category: "gacha", tags: ["抽卡", "保底"], timeModel: "probability", status: "planned", milestone: "M1" },
  { id: "gacha.budget", name: "抽卡機率與預算模擬器", summary: "精確計算平均抽數、P90/P95 與預算內達成機率。", category: "gacha", tags: ["抽卡", "預算", "分布"], timeModel: "probability", status: "planned", milestone: "M1" },
  { id: "gacha.disclosure", name: "機率公示產生器", summary: "依卡池設定產生機率公示表（法規要求待查證）。", category: "gacha", tags: ["抽卡", "法規", "台灣"], timeModel: "probability", status: "researching", milestone: "M1" },
  { id: "action.order", name: "速度與行動順序模擬器", summary: "調整速度，即時看到行動時間軸的變化。", category: "action", tags: ["速度", "行動值", "回合"], timeModel: "turn-based", status: "planned", milestone: "M3" },
  { id: "action.energy", name: "技能資源與能量模擬器", summary: "每回合資源曲線與大招充能時間。", category: "action", tags: ["能量", "資源", "大招"], timeModel: "turn-based", status: "planned", milestone: "M3" },
  { id: "status.break", name: "弱點削韌與擊破模擬器", summary: "比較技能削韌量、擊破所需回合與資源成本。", category: "status", tags: ["弱點", "韌性", "擊破"], timeModel: "turn-based", status: "planned", milestone: "M3" },
  { id: "status.effects", name: "狀態效果與結算編輯器", summary: "定義持續時間、疊層與結算時機，並預覽觸發順序。", category: "status", tags: ["狀態", "Buff", "DoT"], timeModel: "turn-based", status: "planned", milestone: "M3" },
  { id: "character.stats", name: "角色數值與職能編輯器", summary: "編輯角色基礎數值、成長與職能定位。", category: "character", tags: ["角色", "數值"], timeModel: "static", status: "planned", milestone: "M4" },
  { id: "character.skills", name: "技能與目標規則編輯器", summary: "用表單與條件積木定義技能效果與目標選擇。", category: "character", tags: ["技能", "目標"], timeModel: "turn-based", status: "planned", milestone: "M4" },
  { id: "enemy.ai", name: "敵人 AI 規則編輯器", summary: "條件加權重的敵人行動規則表。", category: "enemy", tags: ["AI", "敵人"], timeModel: "turn-based", status: "planned", milestone: "M4" },
  { id: "enemy.encounter", name: "戰鬥情境與關卡編輯器", summary: "配置敵人波次、初始狀態與勝敗條件。", category: "enemy", tags: ["關卡", "波次"], timeModel: "turn-based", status: "planned", milestone: "M4" },
  { id: "growth.rewards", name: "簡易成長與獎勵配置器", summary: "升級曲線與戰鬥獎勵。", category: "growth", tags: ["成長", "獎勵"], timeModel: "static", status: "planned", milestone: "M5" },
  { id: "sim.step", name: "單場逐步執行與重播", summary: "一步步執行戰鬥，查看每個事件與完整狀態。", category: "simulation", tags: ["模擬", "重播", "除錯"], timeModel: "turn-based", status: "planned", milestone: "M3" },
  { id: "sim.batch", name: "批量戰鬥模擬", summary: "跑 N 場統計勝率、回合數與傷害來源。", category: "simulation", tags: ["模擬", "統計"], timeModel: "turn-based", status: "planned", milestone: "M3" },
  { id: "sim.ab", name: "A/B 方案比較", summary: "任意兩份專案快照的結果差異。", category: "simulation", tags: ["比較", "A/B"], timeModel: "static", status: "planned", milestone: "M4" },
];
