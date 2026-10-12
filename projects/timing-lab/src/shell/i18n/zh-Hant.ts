// Source-language (zh-Hant) UI text for the page shell (header, mode tabs) and the shared game-tuned preset. Defines the shape; en.ts must match it.
export const zhHant = {
  title: "格擋閃避判定研究室",
  intro: "格擋和閃避只是兩筆互動資料：可以改判定窗、結果與效果，用逐幀分析拆解每一次按鍵，也能拿同一組規則進實戰試玩。",
  tabsLabel: "模式",
  tabLab: "逐幀分析",
  tabPlay: "實戰試玩",
  loadingPlay: "載入試玩…",
  preset: {
    name: "子彈格擋（預設）",
    description: "寬鬆判定窗；閃避 2 次充能、每 3 秒回 1 次；技能耗滿量表、無敵 4 秒；完美格擋會把子彈打回去。",
  },
};

export type ShellText = typeof zhHant;
