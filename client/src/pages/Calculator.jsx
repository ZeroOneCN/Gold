import { useState, useEffect } from 'react';

const CARD_STYLE = { backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '28px' };
const BTN_PRIMARY = { backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '12px 24px', border: 'none', cursor: 'pointer', fontSize: '16px' };
const BTN_DANGER = { backgroundColor: 'var(--color-danger)', color: '#ffffff', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: '14px' };
const BTN_GHOST = { backgroundColor: 'var(--color-surface-1)', color: 'var(--color-ink)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '8px 16px', border: '1px solid var(--color-hairline)', cursor: 'pointer', fontSize: '14px' };

const CONTRACTS = {
  XAUUSD: { name: '黄金/美元', lotUnits: 100, minLot: 0.01, maxLot: 100 },
  XAGUSD: { name: '白银/美元', lotUnits: 5000, minLot: 0.01, maxLot: 100 }
};

const DEFAULT_POSITION = { instrument: 'XAUUSD', order_type: 'buy', open_price: '', lot_size: '0.01', close_price: '' };
const DEFAULT_SHARED = { leverage: '500', balance: '', forced_liquidation_ratio: '0.5' };

const STORAGE_KEY = 'gold_calc_multi';

function loadFromStorage(fallback) {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}

export default function Calculator() {
  const saved = loadFromStorage(null);
  const [positions, setPositions] = useState(saved?.positions || [{ ...DEFAULT_POSITION }]);
  const [shared, setShared] = useState(saved?.shared || DEFAULT_SHARED);
  const [result, setResult] = useState(saved?.result || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 自动保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, shared, result }));
  }, [positions, shared, result]);

  // 首次加载时获取净值
  useEffect(() => {
    if (shared.balance) return;
    fetch('/api/stats/overview')
      .then(r => r.json())
      .then(data => {
        if (data.capital?.equity && data.capital.equity > 0) {
          setShared(prev => ({ ...prev, balance: String(Math.round(data.capital.equity * 100) / 100) }));
        }
      })
      .catch(() => {});
  }, []);

  const updateShared = (key, value) => setShared(prev => ({ ...prev, [key]: value }));
  const updatePosition = (idx, key, value) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [key]: value } : p));
  };
  const addPosition = () => setPositions(prev => [...prev, { ...DEFAULT_POSITION }]);
  const removePosition = (idx) => {
    if (positions.length <= 1) return;
    setPositions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCompute = async () => {
    setError('');
    setLoading(true);
    try {
      const body = {
        positions: positions.map(p => ({
          instrument: p.instrument,
          order_type: p.order_type,
          open_price: parseFloat(p.open_price) || 0,
          lot_size: parseFloat(p.lot_size) || 0,
          close_price: p.close_price ? parseFloat(p.close_price) : null
        })),
        leverage: parseFloat(shared.leverage) || 500,
        balance: parseFloat(shared.balance) || 0,
        forced_liquidation_ratio: parseFloat(shared.forced_liquidation_ratio) || 0.5
      };
      const res = await fetch('/api/calculator/compute-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || '计算失败');
        setResult(null);
      }
    } catch (err) {
      setError('网络请求失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.8px]" style={{ color: 'var(--color-ink)' }}>交易计算</h1>
        <p className="mt-1 text-[16px]" style={{ color: 'var(--color-ink-muted)' }}>多仓位保证金、强平价、盈亏计算，支持 XAUUSD 和 XAGUSD</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 左侧：参数 + 仓位列表 */}
        <div className="space-y-4">
          {/* 共享参数 */}
          <div style={CARD_STYLE}>
            <h3 className="text-[18px] font-medium mb-4" style={{ color: 'var(--color-ink)' }}>账户参数</h3>
            <div className="grid grid-cols-2 gap-4">
              <CalcField label="杠杆倍数" value={shared.leverage} onChange={v => updateShared('leverage', v)} type="number" hint="常用: 100/200/500" />
              <CalcField label="账户余额 ($)" value={shared.balance} onChange={v => updateShared('balance', v)} type="number" hint="自动获取净值，可改" />
            </div>
            <div className="mt-3">
              <CalcField label="强平比例" value={shared.forced_liquidation_ratio} onChange={v => updateShared('forced_liquidation_ratio', v)} type="number" hint="默认 50%，即保证金比例低于此值时强平" />
            </div>
          </div>

          {/* 仓位列表 */}
          <div style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-medium" style={{ color: 'var(--color-ink)' }}>仓位列表</h3>
              <button style={BTN_GHOST} onClick={addPosition}>+ 添加仓位</button>
            </div>
            <div className="space-y-3">
              {positions.map((p, idx) => (
                <div key={idx} className="p-4 rounded-md relative" style={{ backgroundColor: 'var(--color-canvas)', border: '1px solid var(--color-hairline)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-mono" style={{ color: 'var(--color-ink-tertiary)' }}>仓位 #{idx + 1}</span>
                    {positions.length > 1 && (
                      <button style={BTN_DANGER} onClick={() => removePosition(idx)}>删除</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <CalcSelect label="品种" value={p.instrument} onChange={v => updatePosition(idx, 'instrument', v)} options={[
                      { value: 'XAUUSD', label: 'XAUUSD 黄金' }, { value: 'XAGUSD', label: 'XAGUSD 白银' }
                    ]} />
                    <CalcSelect label="方向" value={p.order_type} onChange={v => updatePosition(idx, 'order_type', v)} options={[
                      { value: 'buy', label: '做多 Buy' }, { value: 'sell', label: '做空 Sell' }
                    ]} />
                    <CalcField label="开仓价格" value={p.open_price} onChange={v => updatePosition(idx, 'open_price', v)} type="number" />
                    <CalcField label="手数" value={p.lot_size} onChange={v => updatePosition(idx, 'lot_size', v)} type="number" />
                  </div>
                  <div className="mt-3">
                    <CalcField label="平仓价格（可选）" value={p.close_price} onChange={v => updatePosition(idx, 'close_price', v)} type="number" hint="填平仓价后可计算各仓位盈亏" />
                  </div>
                </div>
              ))}
            </div>
            <button style={{ ...BTN_PRIMARY, width: '100%', marginTop: '16px' }} onClick={handleCompute} disabled={loading}>
              {loading ? '计算中...' : `计算 ${positions.length} 个仓位`}
            </button>
            {error && <div className="mt-3 text-sm p-3 rounded-md" style={{ color: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 15%, transparent)' }}>{error}</div>}
          </div>
        </div>

        {/* 右侧：计算结果 */}
        <div className="space-y-4">
          {result && result.summary && result.positions ? (
            <>
              {/* 汇总卡片 */}
              <div style={CARD_STYLE}>
                <h3 className="text-[18px] font-medium mb-4" style={{ color: 'var(--color-ink)' }}>汇总结果</h3>
                <div className="space-y-3">
                  <ResultRow label="仓位数量" value={`${result.summary.position_count} 个`} />
                  <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                    <ResultRow label="总合约价值" value={`$${result.summary.total_contract_value.toLocaleString()}`} />
                    <ResultRow label="总保证金" value={`$${result.summary.total_margin.toLocaleString()}`} highlight />
                    <ResultRow label="账户余额" value={`$${result.summary.balance.toLocaleString()}`} />
                    <ResultRow label="净值(含浮动盈亏)" value={`$${result.summary.equity.toLocaleString()}`} />
                    <ResultRow label="保证金比例" value={`${result.summary.margin_ratio}%`} color={
                      result.summary.margin_ratio > 1000 ? 'var(--color-success)' :
                      result.summary.margin_ratio > 200 ? 'var(--color-primary)' : 'var(--color-danger)'
                    } highlight />
                  </div>
                  {result.summary.total_pnl !== null && (
                    <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                      <ResultRow label="总预计盈亏" value={`$${result.summary.total_pnl}`} color={
                        result.summary.total_pnl > 0 ? 'var(--color-success)' : result.summary.total_pnl < 0 ? 'var(--color-danger)' : 'var(--color-ink)'
                      } highlight />
                    </div>
                  )}
                  {/* 爆仓分析 */}
                  <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px', marginTop: '12px' }}>
                    <div className="text-[14px] font-semibold mb-3" style={{ color: 'var(--color-danger)' }}>爆仓分析（全账户）</div>
                    <ResultRow label="爆仓净值阈值" value={`$${result.summary.fl_threshold.toLocaleString()}`} color="var(--color-danger)" />
                    <ResultRow label="当前可承受亏损" value={`$${result.summary.available_loss.toLocaleString()}`} color={result.summary.available_loss > 0 ? 'var(--color-success)' : 'var(--color-danger)'} highlight />
                    {result.summary.total_weighted_move !== null && (
                      <ResultRow label="触发爆仓需波动" value={`${result.summary.total_weighted_move}%`} color="var(--color-danger)" />
                    )}
                    <ResultRow label="风险评级" value={result.summary.risk_level} color={
                      result.summary.risk_level === '安全' ? 'var(--color-success)' :
                      result.summary.risk_level === '正常' ? 'var(--color-primary)' :
                      result.summary.risk_level === '警戒' ? 'var(--color-danger)' : 'var(--color-danger)'
                    } highlight />
                  </div>
                </div>
              </div>

              {/* 各仓位明细 */}
              <div style={CARD_STYLE}>
                <h3 className="text-[18px] font-medium mb-4" style={{ color: 'var(--color-ink)' }}>仓位明细</h3>
                <div className="space-y-3">
                  {result.positions.map((p, i) => (
                    <div key={i} className="p-4 rounded-md" style={{ backgroundColor: 'var(--color-canvas)', border: '1px solid var(--color-hairline)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[14px] font-medium" style={{ color: 'var(--color-ink)' }}>
                          #{p.index} {p.instrument}
                        </span>
                        <span className="text-[13px] font-medium px-2 py-0.5 rounded-full" style={{
                          backgroundColor: p.order_type === '做多' ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'color-mix(in srgb, var(--color-danger) 15%, transparent)',
                          color: p.order_type === '做多' ? 'var(--color-success)' : 'var(--color-danger)'
                        }}>{p.order_type}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
                        <span style={{ color: 'var(--color-ink-subtle)' }}>开仓价</span>
                        <span className="font-mono text-right" style={{ color: 'var(--color-ink)' }}>{p.open_price}</span>
                        <span style={{ color: 'var(--color-ink-subtle)' }}>手数</span>
                        <span className="font-mono text-right" style={{ color: 'var(--color-ink-muted)' }}>{p.lot_size}</span>
                        <span style={{ color: 'var(--color-ink-subtle)' }}>保证金</span>
                        <span className="font-mono text-right font-medium" style={{ color: 'var(--color-ink)' }}>${p.margin}</span>
                        <span style={{ color: 'var(--color-ink-subtle)' }}>点值</span>
                        <span className="font-mono text-right" style={{ color: 'var(--color-ink-muted)' }}>${p.point_value}</span>
                        {p.pnl !== null && (
                          <>
                            <span style={{ color: 'var(--color-ink-subtle)' }}>盈亏</span>
                            <span className="font-mono text-right font-medium" style={{ color: p.pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {p.pnl >= 0 ? '+' : ''}{p.pnl}
                            </span>
                          </>
                        )}
                        {p.forced_liquidation_price != null && (
                          <>
                            <span style={{ color: 'var(--color-ink-subtle)' }}>强平价</span>
                            <span className="font-mono text-right font-medium" style={{ color: 'var(--color-danger)' }}>
                              ${p.forced_liquidation_price}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={CARD_STYLE}>
              <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-ink-subtle)' }}>
                <p className="text-[15px]">添加仓位并点击「计算 N 个仓位」查看结果</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 合约规格 */}
      <div style={CARD_STYLE}>
        <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>合约规格参考</h3>
        <div className="grid grid-cols-2 gap-8">
          {Object.entries(CONTRACTS).map(([key, info]) => (
            <div key={key}>
              <h4 className="font-medium mb-2" style={{ color: 'var(--color-primary)' }}>{info.name}</h4>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                <span style={{ color: 'var(--color-ink-subtle)' }}>合约单位</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>{info.lotUnits} 盎司/手</span>
                <span style={{ color: 'var(--color-ink-subtle)' }}>最小手数</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>{info.minLot}</span>
                <span style={{ color: 'var(--color-ink-subtle)' }}>最大手数</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>{info.maxLot}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalcField({ label, value, onChange, type = 'text', hint }) {
  return (
    <div>
      <label className="block text-[13px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full" step={type === 'number' ? 'any' : undefined} />
      {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--color-ink-tertiary)' }}>{hint}</span>}
    </div>
  );
}

function CalcSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[13px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ResultRow({ label, value, color, highlight }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-[14px]" style={{ color: 'var(--color-ink-subtle)' }}>{label}</span>
      <span className="font-mono font-medium" style={{
        color: color || 'var(--color-ink)',
        fontSize: highlight ? '18px' : '14px'
      }}>{value}</span>
    </div>
  );
}
