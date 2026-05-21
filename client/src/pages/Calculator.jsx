import { useState, useEffect } from 'react';

const CARD_STYLE = { backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '28px' };
const BTN_PRIMARY = { backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '12px 24px', border: 'none', cursor: 'pointer', fontSize: '16px' };

const CONTRACT_INFO = {
  XAUUSD: { name: '黄金/美元 (XAUUSD)', lotUnits: 100, minLot: 0.01, maxLot: 100, typicalSpread: 0.30 },
  XAGUSD: { name: '白银/美元 (XAGUSD)', lotUnits: 5000, minLot: 0.01, maxLot: 100, typicalSpread: 0.03 }
};

const DEFAULT_INPUTS = {
  instrument: 'XAUUSD',
  order_type: 'buy',
  open_price: '4490.00',
  lot_size: '0.01',
  leverage: '500',
  balance: '',
  close_price: '4495.00',
  forced_liquidation_ratio: '0.5'
};

const STORAGE_KEY_INPUTS = 'gold_calc_inputs';
const STORAGE_KEY_RESULT = 'gold_calc_result';

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function Calculator() {
  const [inputs, setInputs] = useState(() => loadFromStorage(STORAGE_KEY_INPUTS, DEFAULT_INPUTS));
  const [result, setResult] = useState(() => loadFromStorage(STORAGE_KEY_RESULT, null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 输入参数变更时自动保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INPUTS, JSON.stringify(inputs));
  }, [inputs]);

  // 计算结果变更时自动保存
  useEffect(() => {
    if (result) {
      localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(result));
    }
  }, [result]);

  // 首次加载时从统计 API 获取当前净值作为账户余额
  useEffect(() => {
    if (inputs.balance) return; // 已有值则跳过（来自 localStorage 或手动输入）
    fetch('/api/stats/overview')
      .then(r => r.json())
      .then(data => {
        if (data.capital?.equity && data.capital.equity > 0) {
          setInputs(prev => ({ ...prev, balance: String(data.capital.equity) }));
        }
      })
      .catch(() => {});
  }, []);

  const contract = CONTRACT_INFO[inputs.instrument];

  const handleCompute = async () => {
    setError('');
    setLoading(true);
    try {
      const body = {};
      Object.keys(inputs).forEach(k => {
        const val = parseFloat(inputs[k]);
        body[k] = isNaN(val) ? inputs[k] : val;
      });
      const res = await fetch('/api/calculator/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '计算失败');
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('网络请求失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const updateInput = (key, value) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-[-0.8px]" style={{ color: 'var(--color-ink)' }}>交易计算</h1>
        <p className="mt-1 text-[16px]" style={{ color: 'var(--color-ink-muted)' }}>保证金、强平价、盈亏计算，支持 XAUUSD 和 XAGUSD</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Input Panel */}
        <div style={CARD_STYLE}>
          <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>计算参数</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <CalcSelect label="交易品种" value={inputs.instrument} onChange={v => updateInput('instrument', v)} options={[
                { value: 'XAUUSD', label: 'XAUUSD 黄金' },
                { value: 'XAGUSD', label: 'XAGUSD 白银' }
              ]} />
              <CalcSelect label="订单类型" value={inputs.order_type} onChange={v => updateInput('order_type', v)} options={[
                { value: 'buy', label: '做多 (Buy)' },
                { value: 'sell', label: '做空 (Sell)' }
              ]} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <CalcField label="开仓价格" value={inputs.open_price} onChange={v => updateInput('open_price', v)} type="number" hint={`合约单位: ${contract.lotUnits} oz/手`} />
              <CalcField label="手数" value={inputs.lot_size} onChange={v => updateInput('lot_size', v)} type="number" hint={`最小 ${contract.minLot} / 最大 ${contract.maxLot}`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <CalcField label="杠杆倍数" value={inputs.leverage} onChange={v => updateInput('leverage', v)} type="number" hint="常用: 50/100/200/500" />
              <CalcField label="账户余额 ($)" value={inputs.balance} onChange={v => updateInput('balance', v)} type="number" hint="自动获取当前净值，可手动修改" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <CalcField label="平仓价格（可选）" value={inputs.close_price} onChange={v => updateInput('close_price', v)} type="number" hint="留空则只计算保证金" />
              <CalcField label="强平比例" value={inputs.forced_liquidation_ratio} onChange={v => updateInput('forced_liquidation_ratio', v)} type="number" hint="默认50%，即保证金比例低于此值时强平" />
            </div>
            <button style={BTN_PRIMARY} onClick={handleCompute} disabled={loading} className="w-full">
              {loading ? '计算中...' : '开始计算'}
            </button>
            {error && <div className="text-sm p-3 rounded-md" style={{ color: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 15%, transparent)' }}>{error}</div>}
          </div>
        </div>

        {/* Result Panel */}
        <div style={CARD_STYLE}>
          <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>计算结果</h3>
          {result ? (
            <div className="space-y-4">
              <ResultRow label="交易品种" value={result.instrument} />
              <ResultRow label="订单方向" value={result.order_type} color={result.order_type === '做多' ? 'var(--color-success)' : 'var(--color-danger)'} />
              <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                <ResultRow label="合约价值" value={`$${result.contract_value.toLocaleString()}`} />
                <ResultRow label="所需保证金" value={`$${result.margin.toLocaleString()}`} highlight />
                <ResultRow label="每点价值" value={`$${result.point_value}`} />
              </div>
              <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                <ResultRow label="杠杆倍数" value={`${result.leverage}x`} />
                <ResultRow label="账户余额" value={`$${result.balance.toLocaleString()}`} />
                <ResultRow label="账户净值" value={`$${result.equity.toLocaleString()}`} />
                <ResultRow label="保证金比例" value={`${result.margin_ratio}%`} color={
                  result.margin_ratio > 1000 ? 'var(--color-success)' :
                  result.margin_ratio > 200 ? 'var(--color-primary)' :
                  'var(--color-danger)'
                } highlight />
              </div>
              {result.pnl !== null && (
                <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                  <ResultRow label="预计盈亏" value={`$${result.pnl}`} color={
                    result.pnl > 0 ? 'var(--color-success)' : result.pnl < 0 ? 'var(--color-danger)' : 'var(--color-ink)'
                  } highlight />
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                <ResultRow label="强平比例阈值" value={`${result.forced_liquidation_ratio * 100}%`} />
                <ResultRow label="强平价格" value={`$${result.forced_liquidation_price?.toLocaleString()}`} color="var(--color-danger)" highlight />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64" style={{ color: 'var(--color-ink-subtle)' }}>
              <p className="text-sm">请在左侧输入参数后点击"开始计算"</p>
            </div>
          )}
        </div>
      </div>

      {/* Contract Info */}
      <div style={CARD_STYLE}>
        <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>合约规格参考</h3>
        <div className="grid grid-cols-2 gap-8">
          {Object.entries(CONTRACT_INFO).map(([key, info]) => (
            <div key={key}>
              <h4 className="font-medium mb-2" style={{ color: 'var(--color-primary)' }}>{info.name}</h4>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                <span style={{ color: 'var(--color-ink-subtle)' }}>合约单位</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>{info.lotUnits} 盎司/手</span>
                <span style={{ color: 'var(--color-ink-subtle)' }}>最小手数</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>{info.minLot}</span>
                <span style={{ color: 'var(--color-ink-subtle)' }}>最大手数</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>{info.maxLot}</span>
                <span style={{ color: 'var(--color-ink-subtle)' }}>典型点差</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-muted)' }}>${info.typicalSpread}</span>
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
      <label className="block text-[14px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full" step={type === 'number' ? 'any' : undefined} />
      {hint && <span className="block text-[12px] mt-1" style={{ color: 'var(--color-ink-tertiary)' }}>{hint}</span>}
    </div>
  );
}

function CalcSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[14px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ResultRow({ label, value, color, highlight }) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-[15px]" style={{ color: 'var(--color-ink-subtle)' }}>{label}</span>
      <span className="font-mono font-medium" style={{
        color: color || 'var(--color-ink)',
        fontSize: highlight ? '20px' : '15px'
      }}>{value}</span>
    </div>
  );
}
