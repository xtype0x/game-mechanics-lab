# 星際研究旅途主視覺（v4）

延續第三版的二遊官網致敬版面與計畫文案，只替換主視覺及加入 AI 標示。

## 參考與取捨

已在官方頁面實際檢視以下圖像：

- [2023 年 1.0 上線公告](https://hsr.hoyoverse.com/en-us/news/111258)：星空、行星弧線、斜向群像與清楚的明暗分區。
- [2026 年 4.6 更新公告](https://hsr.hoyoverse.com/en-us/news/166468)：前景角色與背景景物的層次、較明亮的色彩與宣傳海報構圖。

現行官網版本入口可以讀取文字，但主圖資源未載入，因此以官方版本公告中的主視覺作為近期參考；未聲稱完整比較所有歷史官網。

這次採用更接近早期星際旅途的方向：星空、列車、簡單的研究旅伴與骰子夥伴。原創角色穿著普通外套，減少服裝配件、胸下帶子與過度金屬渲染。用筆記本、手把、卡尺保留遊戲機制研究的幽默感。

## AI 標示

主視覺桌面右上角、手機左上角以 HTML 顯示「主視覺 · AI 生成圖像」，不藏在滑鼠提示內。手機標示位置避開人物臉部。圖片替代文字亦說明 AI 生成。標示屬於網頁，不是生成圖中的文字，之後換圖仍可維護。

## 圖像來源與提示詞

工具：內建 imagegen。模式：generate（生成全新替代圖，未使用參考圖片輸入）。資產：`src/assets/gacha-keyvisual-v4.png`。v3 原始圖保留以便比較。

實際提示詞：

```text
Use case: stylized-concept.
Asset type: original 16:9 landscape website hero illustration, artwork only.
Primary request: replace an over-rendered AI-looking anime key visual with a deliberately designed, clean 2D anime adventure poster for gacha-game-tool, an indie game-mechanic research playground. Affectionate homage to the early space-travel posters of Honkai: Star Rail: dark star field, planetary arc, diagonal train journey, strong original character silhouettes and breathing room. Do not reproduce existing franchise characters.
Scene/backdrop: a midnight-blue observatory platform in space. An elegant short ivory-and-teal research train crosses a crescent-shaped track in the middle distance, lit windows and a few golden stars, one large pale planet. Restrained graphic shapes, no busy city, no ornamental machinery.
Subjects: two original adult friends occupy the RIGHT half: a short dark-blue-haired woman game developer in a loose cream long-sleeved overshirt over a plain teal crew-neck shirt and straight dark trousers; a copper-brown-haired male gamer in a simple navy jacket and pale shirt behind her. Relaxed curious expressions, clearly different faces. Waist-up or knee-up, natural anatomy. Woman carries a closed mustard-yellow notebook close to her side with a relaxed simple grip, man has a small game controller at his side. No complicated action poses. Near them a SMALL die-shaped companion robot carries an oversized simple measuring caliper as a humorous research tool, rather than a weapon.
Style/medium: authentic-looking inked 2D anime poster illustration: confident varied line weight, broad two-tone cel shadows, limited flat colors, slight matte paper grain, simplified hands and clothes, clear silhouettes. Character drawings should feel designed and edited. Mostly flat shapes, NOT glossy 3D, NOT photorealism, NOT heavily rendered concept art. Sparse background details with intentional visual hierarchy.
Composition/framing: wide 16:9. Left 44 percent is dark, mostly empty space reserved for a large HTML headline. Characters centered around x=72 percent, faces at y=28 percent, main figures contained within x=58 to 90 percent so mobile cropping still works. Train forms a diagonal behind them. Top 12 percent and bottom 12 percent relatively quiet. Avoid cropping faces.
Color palette: midnight navy, desaturated petrol teal, warm ivory, muted ochre gold. One clear warm window glow, no bloom or laser effects.
Text: no text or letters in the image. AI disclosure will be added in HTML.
Constraints: no chest straps, harnesses, belts under the breasts, corsets, cutouts, floating buckles, decorative ribbons, armor, revealing clothing, random cables, ornate weapons, logos, franchise likenesses, watermark or UI. Clothes have simple plausible seams. No excess stars, particles, glitter or gears. Favor a cohesive modest original costume and an uncluttered story over detail.
```
