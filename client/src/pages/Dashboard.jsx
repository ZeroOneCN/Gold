import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CARD_STYLE = { backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '28px' };

const BTN_PRIMARY = { backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 15 };

const AI_STORAGE_KEY = 'gold_ai_analysis';

// 简易 Markdown 渲染
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    // 转义 HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // **bold**
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-ink)">$1</strong>')
    // `code`
    .replace(/`(.+?)`/g, '<code style="background:var(--color-surface-3);padding:2px 6px;border-radius:4px;font-size:13px">$1</code>')
    // ### heading
    .replace(/^### (.+)$/gm, '<h4 style="font-size:16px;font-weight:600;margin:14px 0 6px;color:var(--color-ink)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:18px;font-weight:600;margin:16px 0 8px;color:var(--color-ink)">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="font-size:20px;font-weight:600;margin:18px 0 10px;color:var(--color-ink)">$1</h2>')
    // - list item
    .replace(/^- (.+)$/gm, '<li style="margin-left:16px;color:var(--color-ink-muted)">$1</li>')
    // 1. numbered list
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;color:var(--color-ink-muted)">$1</li>')
    // horizontal rule
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--color-hairline);margin:12px 0">')
    // double newline → paragraph break
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    // single newline → <br>
    .replace(/\n/g, '<br>');

  // wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li><br>)+)/g, '<ul style="list-style:none;padding:4px 0;margin:4px 0">$1</ul>');
  // remove <br> between </li> and <li>
  html = html.replace(/<\/li><br><li/g, '</li><li');
  html = html.replace(/<\/li><br><\/ul>/g, '</li></ul>');
  html = html.replace(/<ul[^>]*><br>/g, '<ul>');

  return `<p style="margin:8px 0">${html}</p>`;
}

function loadAiFromStorage() {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // 24小时过期
    if (data.timestamp && Date.now() - data.timestamp > 86400000) {
      localStorage.removeItem(AI_STORAGE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [dailyPnl, setDailyPnl] = useState([]);
  const [loading, setLoading] = useState(true);

  // AI 分析状态 — 从 localStorage 恢复
  const savedAi = loadAiFromStorage();
  const [aiStartDate, setAiStartDate] = useState(savedAi?.startDate || '2026/05/13');
  const [aiEndDate, setAiEndDate] = useState(savedAi?.endDate || '2026/05/21');
  const [aiResult, setAiResult] = useState(savedAi?.result || null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [ovRes, dpRes] = await Promise.all([
          fetch('/api/stats/overview'),
          fetch('/api/stats/daily-pnl')
        ]);
        const ov = await ovRes.json();
        const dp = await dpRes.json();
        setOverview(ov);
        setDailyPnl(dp);
      } catch (err) {
        console.error('获取统计数据失败:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleAiAnalyze = async () => {
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    try {
      const res = await fetch('/api/analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: aiStartDate, end_date: aiEndDate })
      });
      const data = await res.json();
      if (res.ok) {
        setAiResult(data);
        localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({
          startDate: aiStartDate,
          endDate: aiEndDate,
          result: data,
          timestamp: Date.now()
        }));
      } else {
        setAiError(data.error || '分析失败');
      }
    } catch (err) {
      setAiError('网络请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-[17px]" style={{ color: 'var(--color-ink-subtle)' }}>加载中...</div>;
  }

  if (!overview) {
    return <div className="flex items-center justify-center h-full text-[17px]" style={{ color: 'var(--color-ink-subtle)' }}>暂无数据</div>;
  }

  const winRateData = [
    { name: '盈利', value: overview.win_count, color: 'var(--color-success)' },
    { name: '亏损', value: overview.loss_count, color: 'var(--color-danger)' }
  ];

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.8px]" style={{ color: 'var(--color-ink)' }}>统计分析</h1>
        <p className="mt-1 text-[16px]" style={{ color: 'var(--color-ink-muted)' }}>交易数据总览与分析</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard label="总交易笔数" value={overview.total_trades} />
        <StatCard label="净盈亏" value={overview.total_pnl} colored prefix="$" />
        <StatCard label="胜率" value={`${overview.win_rate}%`} />
        <StatCard label="手续费" value={overview.total_commission} prefix="$" />
        <StatCard label="盈利笔数" value={overview.win_count} />
        <StatCard label="亏损笔数" value={overview.loss_count} />
        <StatCard label="做多笔数" value={overview.buy?.count || 0} />
        <StatCard label="做空笔数" value={overview.sell?.count || 0} />
      </div>

      {/* 资金联动概览 */}
      {overview.capital && (
        <div className="grid grid-cols-5 gap-5">
          <StatCard label="累计入金" value={overview.capital.total_deposit} prefix="$" />
          <StatCard label="累计出金" value={overview.capital.total_withdrawal} prefix="$" />
          <StatCard label="净入金" value={overview.capital.net_capital} prefix="$" colored />
          <StatCard label="当前净值" value={overview.capital.equity} prefix="$" colored />
          <StatCard label="收益率" value={`${overview.capital.roi}%`} colored />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* P&L Curve */}
        <div style={CARD_STYLE}>
          <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>每日盈亏曲线</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyPnl}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" />
              <XAxis dataKey="trade_date" tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-hairline-strong)', borderRadius: '8px', color: 'var(--color-ink)', fontSize: 14 }}
                formatter={(value) => [`$${value}`, '盈亏']}
              />
              <Line type="monotone" dataKey="total_pnl" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Win Rate Pie */}
        <div style={CARD_STYLE}>
          <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>盈亏分布</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={winRateData}
                cx="50%"
                cy="50%"
                innerRadius={75}
                outerRadius={110}
                paddingAngle={4}
                dataKey="value"
              >
                {winRateData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-hairline-strong)', borderRadius: '8px', color: 'var(--color-ink)', fontSize: 14 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-8 mt-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
              <span className="text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>盈利 {overview.win_count} 笔</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: 'var(--color-danger)' }} />
              <span className="text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>亏损 {overview.loss_count} 笔</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[14px] flex items-center gap-1" style={{ color: 'var(--color-ink-tertiary)' }}>
                盈亏比
                <span className="relative group cursor-help">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-ink-tertiary)"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-md text-[12px] leading-relaxed whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50" style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-hairline-strong)', color: 'var(--color-ink-muted)' }}>
                    盈亏比 = 平均盈利 ÷ |平均亏损|<br/>
                    比值 &ge; 1 表示盈利覆盖亏损，&lt; 1 需警惕
                  </div>
                </span>
              </span>
              <span className="text-[15px] font-semibold font-mono" style={{
                color: overview.profit_loss_ratio >= 1 ? 'var(--color-success)' : 'var(--color-danger)'
              }}>
                {overview.profit_loss_ratio > 0 ? overview.profit_loss_ratio.toFixed(2) : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* By Instrument */}
      {overview.by_instrument?.length > 0 && (
        <div style={CARD_STYLE}>
          <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>品种分析</h3>
          <table className="w-full" style={{ fontSize: 15 }}>
            <thead>
              <tr style={{ color: 'var(--color-ink-subtle)', borderBottom: '1px solid var(--color-hairline)' }}>
                <th className="text-left py-3 font-medium">品种</th>
                <th className="text-right py-3 font-medium">笔数</th>
                <th className="text-right py-3 font-medium">总盈亏</th>
                <th className="text-right py-3 font-medium">均盈</th>
                <th className="text-right py-3 font-medium">胜率</th>
              </tr>
            </thead>
            <tbody>
              {overview.by_instrument.map(item => (
                <tr key={item.instrument} style={{ borderBottom: '1px solid var(--color-hairline)' }}>
                  <td className="py-3 text-[16px] font-medium" style={{ color: 'var(--color-ink)' }}>{item.instrument}</td>
                  <td className="py-3 text-right" style={{ color: 'var(--color-ink-muted)' }}>{item.cnt}</td>
                  <td className="py-3 text-right font-mono text-[16px] font-medium" style={{ color: item.total_pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>${Number(item.total_pnl).toFixed(2)}</td>
                  <td className="py-3 text-right font-mono" style={{ color: 'var(--color-ink-muted)' }}>${Number(item.avg_pnl).toFixed(2)}</td>
                  <td className="py-3 text-right" style={{ color: 'var(--color-ink-muted)' }}>{item.win_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI 智能分析 */}
      <div style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-[18px] font-medium" style={{ color: 'var(--color-ink)' }}>AI 智能分析</h3>
          <span className="text-[12px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}>DeepSeek</span>
        </div>
        <p className="text-[14px] mb-5" style={{ color: 'var(--color-ink-muted)' }}>选择日期范围，由 AI 根据交易记录进行多维度分析（仅在你手动点击后触发）</p>

        <div className="flex items-center gap-3 mb-5">
          <input type="text" value={aiStartDate} onChange={e => setAiStartDate(e.target.value)} placeholder="起始日期" style={{ width: 130 }} />
          <span style={{ color: 'var(--color-ink-subtle)' }}>—</span>
          <input type="text" value={aiEndDate} onChange={e => setAiEndDate(e.target.value)} placeholder="结束日期" style={{ width: 130 }} />
          <button style={BTN_PRIMARY} onClick={handleAiAnalyze} disabled={aiLoading}>
            {aiLoading ? '分析中...' : '开始分析'}
          </button>
        </div>

        {/* 分析结果 */}
        {aiError && (
          <div style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 15%, transparent)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', padding: '14px 18px', color: 'var(--color-danger)', fontSize: 15 }}>
            {aiError}
          </div>
        )}
        {aiResult && (
          <div>
            {aiResult.stats && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <MiniStat label="分析笔数" value={aiResult.stats.total_trades} />
                <MiniStat label="总盈亏" value={`$${aiResult.stats.total_pnl}`} colored />
                <MiniStat label="胜率" value={`${aiResult.stats.win_rate}%`} />
                <MiniStat label="盈亏比" value={aiResult.stats.profit_loss_ratio} />
              </div>
            )}
            <div
              className="p-5 rounded-md text-[15px] leading-relaxed"
              style={{ backgroundColor: 'var(--color-canvas)', border: '1px solid var(--color-hairline)', color: 'var(--color-ink-muted)' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResult.conclusion) }}
            />
          </div>
        )}
      </div>

    </div>
  );
}

function MiniStat({ label, value, colored }) {
  const num = parseFloat(value);
  return (
    <div style={{ backgroundColor: 'var(--color-canvas)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-sm)', padding: '12px 16px' }}>
      <div className="text-[12px] mb-1" style={{ color: 'var(--color-ink-subtle)' }}>{label}</div>
      <div className="text-[17px] font-semibold font-mono" style={{
        color: colored ? (num > 0 ? 'var(--color-success)' : num < 0 ? 'var(--color-danger)' : 'var(--color-ink)') : 'var(--color-ink)'
      }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, colored, prefix }) {
  const isPositive = typeof value === 'number' && value > 0;
  const isNegative = typeof value === 'number' && value < 0;
  const displayValue = typeof value === 'number'
    ? (prefix || '') + (prefix ? value.toFixed(2) : value)
    : value;
  return (
    <div style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
      <div className="text-[14px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</div>
      <div className="text-2xl font-semibold font-mono tracking-tight" style={{
        color: colored ? (isPositive ? 'var(--color-success)' : isNegative ? 'var(--color-danger)' : 'var(--color-ink)') : 'var(--color-ink)'
      }}>
        {displayValue}
      </div>
    </div>
  );
}
