import { PageIntro } from '../../pages/shared';

export default function Privacy() {
  return <><PageIntro eyebrow="YOUR DATA" title="資料與使用說明" text="玩得輕鬆，也知道自己的資料放在哪裡。"/><div className="prose"><h2>網站本身</h2><p>網站沒有帳號、分析追蹤或資料上傳功能。</p><h2>抽卡模擬器</h2><p>模擬設定與分享規則都只存在你的瀏覽器本機（localStorage），網址的分享連結也只在你的瀏覽器中產生與解讀。清除瀏覽器資料就會消失。</p><p>開啟模擬器時，會向公開來源讀取近期卡池資料（api.ennead.cc 與 SchaleDB）。這些請求不含個人資料，但會讓來源看到你的 IP 位址，與一般瀏覽網頁相同。</p><h2>星穹鐵道戰鬥研究室</h2><p>你選的隊伍、敵人、配裝與修改過的角色數值、技能，只存在你的瀏覽器本機（localStorage），不會上傳；按「重設」即可清除並回到範本。這個頁面不會向外部讀取資料。</p><h2>工具的結果怎麼看？</h2><p>工具會標示假設與限制。簡化的範例用來理解規則，實際遊戲仍可能包含尚未建模的條件。這是一個個人的開發與研究計畫。</p></div></>;
}
