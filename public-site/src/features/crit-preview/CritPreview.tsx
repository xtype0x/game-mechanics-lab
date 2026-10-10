import { useState } from 'react';

export function CritPreview() {
  const [chance, setChance] = useState(50);
  // Intentionally a tiny illustration, not a port of the research engine.
  const expected = 1000 * (1 + chance / 100 * 1.5);
  const points = Array.from({ length: 11 }, (_, i) => `${28 + i * 32},${160 - i * 12}`).join(' ');
  return <div className="instrument">
    <div className="instrument-top"><span><i className="status-dot" /> 可以直接玩的小範例</span><span>暴擊小試算</span></div>
    <div className="instrument-title"><span>暴擊多一點，傷害差多少？</span><span className="pill">簡化示範</span></div>
    <div className="result"><div><span className="small-label">平均每次傷害（期望值）</span><output aria-live="polite">{expected.toLocaleString('en-US')}</output></div><span className="result-note">基礎傷害 1,000<br />暴擊額外 +150%</span></div>
    <svg viewBox="0 0 380 194" role="img" aria-label={`暴擊率與期望傷害為線性關係，目前暴擊率 ${chance}%，期望傷害 ${expected}`}>
      <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#53d6d3" stopOpacity=".35"/><stop offset="1" stopColor="#53d6d3" stopOpacity="0"/></linearGradient></defs>
      {[40, 80, 120, 160].map(y => <line key={y} x1="28" x2="348" y1={y} y2={y} stroke="#62838e" strokeDasharray="3 6" opacity=".45" />)}
      <polygon points={`28,160 ${points} 348,160`} fill="url(#chart-fill)" />
      <polyline points={points} fill="none" stroke="#66d4d0" strokeWidth="3" />
      <line x1={28 + chance * 3.2} x2={28 + chance * 3.2} y1={160 - chance * 1.2} y2="160" stroke="#a2d8de" strokeDasharray="4 5" />
      <circle cx={28 + chance * 3.2} cy={160 - chance * 1.2} r="7" fill="#f5d8a0" stroke="#66d4d0" strokeWidth="3" />
      <text x="28" y="185" fill="#a9bec8" fontSize="11">0%</text><text x="180" y="185" fill="#a9bec8" fontSize="11">50%</text><text x="326" y="185" fill="#a9bec8" fontSize="11">100%</text>
    </svg>
    <label className="slider-label" htmlFor="crit-chance"><span>暴擊率</span><strong>{chance}%</strong></label>
    <input id="crit-chance" type="range" min="0" max="100" step="1" value={chance} onChange={e => setChance(Number(e.target.value))} />
    <div className="instrument-bottom"><span>← 拖拖看，看看數字怎麼變</span><button onClick={() => setChance(50)}>重設 ↺</button></div>
  </div>;
}
