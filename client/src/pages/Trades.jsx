import { useState, useEffect, useCallback, useRef } from 'react';

// 价格：XAGUSD 白银3位小数，其余2位；盈亏/手续费/手数固定2位
function fmt(value, instrument, decimals) {
  const num = Number(value);
  if (isNaN(num)) return value ?? '-';
  const d = decimals ?? (instrument === 'XAGUSD' ? 3 : 2);
  return num.toFixed(d);
}

const STYLES = {
  card: { backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '24px' },
  btnPrimary: { backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 15 },
  btnSecondary: { backgroundColor: 'var(--color-surface-1)', color: 'var(--color-ink)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '10px 18px', border: '1px solid var(--color-hairline)', cursor: 'pointer', fontSize: 15 },
  btnGhost: { backgroundColor: 'transparent', color: 'var(--color-primary)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '8px 14px', border: '1px solid transparent', cursor: 'pointer', fontSize: 14 },
  btnDanger: { backgroundColor: 'transparent', color: 'var(--color-danger)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '6px 12px', border: '1px solid transparent', cursor: 'pointer', fontSize: 14 },
};

const today = () => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };

const EMPTY_FORM = {
  trade_date: today(), instrument: 'XAUUSD', order_type: 'buy',
  open_price: '', lot_size: '0.01', commission: '-0.06', close_price: '',
  pnl: '', open_time: '', close_time: '', hold_time: '', remark: ''
};

export default function Trades() {
  const [trades, setTrades] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState({ instrument: '', order_type: '' });

  // 导入相关状态
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // 删除确认弹窗
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // Toast 通知
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message: string }

  // 合约单位
  const getContractUnits = (instrument) => instrument === 'XAGUSD' ? 5000 : 100;

  // 根据手数自动计算手续费：0.01手 = -0.06
  const calcCommission = (lot) => {
    const lotNum = parseFloat(lot);
    if (isNaN(lotNum) || lotNum <= 0) return '0';
    return String(Math.round(-lotNum * 6 * 100) / 100);
  };

  // 根据买卖方向自动计算盈亏
  // buy:  (平仓价 - 开仓价) × 手数 × 合约单位
  // sell: (开仓价 - 平仓价) × 手数 × 合约单位
  const calcPnl = (orderType, openPrice, closePrice, lotSize, instrument) => {
    const open = parseFloat(openPrice);
    const close = parseFloat(closePrice);
    const lot = parseFloat(lotSize);
    if (isNaN(open) || isNaN(close) || isNaN(lot) || lot <= 0 || open <= 0 || close <= 0) return '';
    const units = getContractUnits(instrument);
    const diff = orderType === 'buy' ? (close - open) : (open - close);
    return String(Math.round(diff * lot * units * 100) / 100);
  };

  // 根据开仓/平仓时间自动计算持仓时间
  const calcHoldTime = (openTime, closeTime) => {
    if (!openTime || !closeTime) return '';
    const toSeconds = (t) => {
      const parts = t.split(':').map(Number);
      return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    };
    let diff = toSeconds(closeTime) - toSeconds(openTime);
    if (diff < 0) diff += 86400; // 跨日
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    if (h > 0) return `${h}小时${m}分${s}秒`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  };

  // pnl 依赖的字段
  const pnlFields = ['order_type', 'open_price', 'close_price', 'lot_size', 'instrument'];

  // 更新表单字段（带联动计算）
  const updateForm = (key, value) => {
    setForm(f => {
      const next = { ...f, [key]: value };
      if (key === 'lot_size') {
        next.commission = calcCommission(value);
      }
      // 盈亏依赖字段变更时自动重算
      if (pnlFields.includes(key)) {
        next.pnl = calcPnl(
          key === 'order_type' ? value : next.order_type,
          key === 'open_price' ? value : next.open_price,
          key === 'close_price' ? value : next.close_price,
          key === 'lot_size' ? value : next.lot_size,
          key === 'instrument' ? value : next.instrument
        );
      }
      if (key === 'open_time' || key === 'close_time') {
        next.hold_time = calcHoldTime(
          key === 'open_time' ? value : next.open_time,
          key === 'close_time' ? value : next.close_time
        );
      }
      return next;
    });
  };

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filter.instrument) params.set('instrument', filter.instrument);
      if (filter.order_type) params.set('order_type', filter.order_type);
      const res = await fetch(`/api/trades?${params}`);
      const data = await res.json();
      setTrades(data.trades);
      setTotal(data.total);
    } catch (err) {
      console.error('获取交易记录失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    const url = editingId ? `/api/trades/${editingId}` : '/api/trades';
    const method = editingId ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        fetchTrades();
        showToast('success', editingId ? '记录更新成功' : '记录新增成功');
      } else {
        showToast('error', data.error || '操作失败');
      }
    } catch (err) {
      showToast('error', '网络请求失败，请重试');
    }
  };

  const handleEdit = (trade) => {
    setForm({
      trade_date: trade.trade_date, instrument: trade.instrument, order_type: trade.order_type,
      open_price: trade.open_price, lot_size: trade.lot_size, commission: trade.commission,
      close_price: trade.close_price || '', pnl: trade.pnl || '', open_time: trade.open_time || '',
      close_time: trade.close_time || '', hold_time: trade.hold_time || '', remark: trade.remark || ''
    });
    setEditingId(trade.id);
    setShowForm(true);
  };

  const handleDeleteClick = (trade) => {
    setDeleteConfirm(trade);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/trades/${deleteConfirm.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchTrades();
        showToast('success', '记录已删除');
      } else {
        const data = await res.json();
        showToast('error', data.error || '删除失败');
      }
    } catch (err) {
      showToast('error', '网络请求失败，请重试');
    }
  };

  // 文件导入处理
  const handleImportFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      alert('仅支持 .xlsx / .xls / .csv 格式文件');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/trades/import', { method: 'POST', body: formData });
      const data = await res.json();
      setImportResult(data);
      if (data.imported > 0) fetchTrades();
    } catch (err) {
      setImportResult({ error: '导入失败: ' + err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportFile(file);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.8px]" style={{ color: 'var(--color-ink)' }}>交易记录</h1>
          <p className="mt-1 text-[16px]" style={{ color: 'var(--color-ink-muted)' }}>共 {total} 条记录</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 下载模板 */}
          <button style={STYLES.btnGhost} onClick={() => window.open('/api/trades/template')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            下载模板
          </button>
          {/* 导入按钮 */}
          <button
            style={STYLES.btnSecondary}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            {importing ? '导入中...' : '导入数据'}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
          <button style={STYLES.btnPrimary} onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>
            + 新增记录
          </button>
        </div>
      </div>

      {/* 拖拽导入区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-hairline-strong)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: dragOver ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-surface-1)',
          transition: 'all 0.2s ease',
          cursor: 'pointer'
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>点击上传</span> 或将 Excel/CSV 文件拖拽至此
        </p>
        <p className="text-[13px] mt-1" style={{ color: 'var(--color-ink-tertiary)' }}>支持 .xlsx / .xls / .csv 格式，请使用标准模板</p>
      </div>

      {/* 导入结果提示 */}
      {importResult && (
        <div style={{
          backgroundColor: importResult.error ? 'color-mix(in srgb, var(--color-danger) 15%, transparent)' : 'color-mix(in srgb, var(--color-success) 15%, transparent)',
          border: `1px solid ${importResult.error ? 'var(--color-danger)' : 'var(--color-success)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          fontSize: 15
        }}>
          <span style={{ color: importResult.error ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600, fontSize: 16 }}>
            {importResult.error ? importResult.error : '导入完成（追加模式，未删除原始数据）'}
          </span>
          {!importResult.error && (
            <div className="flex gap-6 mt-2 text-[14px]" style={{ color: 'var(--color-ink-muted)' }}>
              <span>新增 <b style={{ color: 'var(--color-success)' }}>{importResult.imported || 0}</b> 条</span>
              <span>去重跳过 <b style={{ color: 'var(--color-primary)' }}>{importResult.duplicates || 0}</b> 条</span>
              <span>异常跳过 <b style={{ color: 'var(--color-danger)' }}>{importResult.skipped || 0}</b> 条</span>
            </div>
          )}
          {importResult.errors?.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[13px]" style={{ color: 'var(--color-ink-muted)' }}>
              {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select value={filter.instrument} onChange={e => { setFilter(f => ({ ...f, instrument: e.target.value })); setPage(1); }}>
          <option value="">全部品种</option>
          <option value="XAUUSD">XAUUSD 黄金</option>
          <option value="XAGUSD">XAGUSD 白银</option>
        </select>
        <select value={filter.order_type} onChange={e => { setFilter(f => ({ ...f, order_type: e.target.value })); setPage(1); }}>
          <option value="">全部类型</option>
          <option value="buy">做多 (Buy)</option>
          <option value="sell">做空 (Sell)</option>
        </select>
      </div>

      {/* Table */}
      <div style={{...STYLES.card, padding: 0, overflow: 'auto'}}>
        <table className="w-full" style={{ minWidth: 1200, fontSize: 15 }}>
          <thead>
            <tr style={{ color: 'var(--color-ink-subtle)', borderBottom: '1px solid var(--color-hairline)' }}>
              {['ID','日期','品种','类型','开仓价','手数','手续费','平仓价','盈亏','开仓时间','平仓时间','持仓','备注','操作'].map(h => (
                <th key={h} className="text-left py-3.5 px-4 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="text-center py-12" style={{ color: 'var(--color-ink-subtle)' }}>加载中...</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-12" style={{ color: 'var(--color-ink-subtle)' }}>暂无数据，请导入或新增交易记录</td></tr>
            ) : (
              trades.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--color-hairline)' }} className="hover:brightness-110">
                  <td className="py-3 px-4 font-mono text-[13px]" style={{ color: 'var(--color-ink-tertiary)' }}>{t.id}</td>
                  <td className="py-3 px-4 whitespace-nowrap" style={{ color: 'var(--color-ink-muted)' }}>{t.trade_date}</td>
                  <td className="py-3 px-4 font-medium text-[16px]" style={{ color: 'var(--color-ink)' }}>{t.instrument}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-1 rounded-full text-[13px] font-medium" style={{
                      backgroundColor: t.order_type === 'buy' ? 'color-mix(in srgb, var(--color-success) 20%, transparent)' : 'color-mix(in srgb, var(--color-danger) 20%, transparent)',
                      color: t.order_type === 'buy' ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>{t.order_type === 'buy' ? '做多' : '做空'}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[15px]" style={{ color: 'var(--color-ink)' }}>{fmt(t.open_price, t.instrument)}</td>
                  <td className="py-3 px-4 font-mono" style={{ color: 'var(--color-ink-muted)' }}>{fmt(t.lot_size, null, 2)}</td>
                  <td className="py-3 px-4 font-mono" style={{ color: t.commission < 0 ? 'var(--color-danger)' : 'var(--color-ink-muted)' }}>{fmt(t.commission, null, 2)}</td>
                  <td className="py-3 px-4 font-mono" style={{ color: 'var(--color-ink-muted)' }}>{t.close_price != null ? fmt(t.close_price, t.instrument) : '-'}</td>
                  <td className="py-3 px-4 font-mono font-medium text-[15px]" style={{ color: t.pnl > 0 ? 'var(--color-success)' : t.pnl < 0 ? 'var(--color-danger)' : 'var(--color-ink-muted)' }}>{t.pnl != null ? `${t.pnl > 0 ? '+' : ''}${fmt(t.pnl, null, 2)}` : '-'}</td>
                  <td className="py-3 px-4 text-[14px]" style={{ color: 'var(--color-ink-muted)' }}>{t.open_time || '-'}</td>
                  <td className="py-3 px-4 text-[14px]" style={{ color: 'var(--color-ink-muted)' }}>{t.close_time || '-'}</td>
                  <td className="py-3 px-4 text-[14px]" style={{ color: 'var(--color-ink-muted)' }}>{t.hold_time || '-'}</td>
                  <td className="py-3 px-4 text-[14px]" style={{ color: 'var(--color-ink-subtle)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.remark || '-'}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <button style={STYLES.btnDanger} onClick={() => handleEdit(t)}>编辑</button>
                    <button style={STYLES.btnDanger} onClick={() => handleDeleteClick(t)}>删除</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}>
          <div onMouseDown={e => e.stopPropagation()} style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-hairline-strong)', borderRadius: 'var(--radius-lg)', padding: '32px', width: '560px', maxHeight: '85vh', overflow: 'auto' }}>
            <h2 className="text-[22px] font-semibold mb-6 tracking-[-0.4px]" style={{ color: 'var(--color-ink)' }}>{editingId ? '编辑交易记录' : '新增交易记录'}</h2>
            <div className="grid grid-cols-2 gap-5">
              <FormField label="日期" value={form.trade_date} onChange={v => setForm(f => ({ ...f, trade_date: v }))} placeholder="yyyy/mm/dd" />
              <FormSelect label="品种" value={form.instrument} onChange={v => updateForm('instrument', v)} options={['XAUUSD', 'XAGUSD']} />
              <FormSelect label="类型" value={form.order_type} onChange={v => updateForm('order_type', v)} options={['buy', 'sell']} />
              <FormField label="开仓价格" value={form.open_price} onChange={v => updateForm('open_price', v)} type="number" />
              <FormField label="手数" value={form.lot_size} onChange={v => updateForm('lot_size', v)} type="number" />
              <FormField label="手续费" value={form.commission} onChange={v => setForm(f => ({ ...f, commission: v }))} type="number" />
              <FormField label="平仓价格" value={form.close_price} onChange={v => updateForm('close_price', v)} type="number" />
              <FormField label="盈亏金额（自动）" value={form.pnl} onChange={v => setForm(f => ({ ...f, pnl: v }))} type="number" placeholder="输入开仓/平仓价自动计算" readOnly />
              <FormField label="开仓时间" value={form.open_time} onChange={v => updateForm('open_time', v)} placeholder="00:13:00" />
              <FormField label="平仓时间" value={form.close_time} onChange={v => updateForm('close_time', v)} placeholder="00:14:10" />
              <FormField label="持仓时间" value={form.hold_time} onChange={v => setForm(f => ({ ...f, hold_time: v }))} placeholder="自动计算" />
              <div className="col-span-2">
                <label className="block text-[14px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>备注</label>
                <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} className="w-full" rows={2} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-7">
              <button style={STYLES.btnSecondary} onClick={() => { setShowForm(false); setEditingId(null); }}>取消</button>
              <button style={STYLES.btnPrimary} onClick={handleSave}>{editingId ? '保存修改' : '新增'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal — Linear 主题 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div onMouseDown={e => e.stopPropagation()} style={{
            backgroundColor: 'var(--color-surface-2)',
            border: '1px solid var(--color-hairline-strong)',
            borderRadius: 'var(--radius-lg)',
            padding: '32px',
            width: '440px'
          }}>
            {/* 红色警告图标 */}
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 15%, transparent)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h3 className="text-[20px] font-semibold mb-2 tracking-[-0.4px]" style={{ color: 'var(--color-ink)' }}>确认删除</h3>
            <p className="text-[15px] leading-relaxed" style={{ color: 'var(--color-ink-muted)' }}>
              此操作不可撤销。确定要删除以下交易记录吗？
            </p>

            {/* 记录摘要 */}
            <div className="mt-4 p-4 rounded-md text-[14px] space-y-1.5" style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-ink-subtle)' }}>ID</span>
                <span className="font-mono" style={{ color: 'var(--color-ink-tertiary)' }}>#{deleteConfirm.id}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-ink-subtle)' }}>品种</span>
                <span className="font-medium" style={{ color: 'var(--color-ink)' }}>{deleteConfirm.instrument}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-ink-subtle)' }}>类型</span>
                <span style={{ color: deleteConfirm.order_type === 'buy' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {deleteConfirm.order_type === 'buy' ? '做多' : '做空'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-ink-subtle)' }}>开仓价</span>
                <span className="font-mono" style={{ color: 'var(--color-ink)' }}>{fmt(deleteConfirm.open_price, deleteConfirm.instrument)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-ink-subtle)' }}>日期</span>
                <span style={{ color: 'var(--color-ink-muted)' }}>{deleteConfirm.trade_date}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button style={STYLES.btnSecondary} onClick={() => setDeleteConfirm(null)}>取消</button>
              <button
                style={{
                  backgroundColor: 'var(--color-danger)',
                  color: '#ffffff',
                  fontWeight: 500,
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 18px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15
                }}
                onClick={handleDeleteConfirm}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 通知 */}
      {toast && (
        <div className="fixed bottom-8 right-8 z-50 animate-bounce" style={{
          backgroundColor: toast.type === 'success'
            ? 'color-mix(in srgb, var(--color-success) 20%, var(--color-surface-2))'
            : 'color-mix(in srgb, var(--color-danger) 20%, var(--color-surface-2))',
          border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '14px 22px',
          maxWidth: '360px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}>
          <div className="flex items-center gap-3">
            {toast.type === 'success' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  const [jumpInput, setJumpInput] = useState('');

  const handleJump = () => {
    const p = parseInt(jumpInput, 10);
    if (p >= 1 && p <= totalPages) {
      onPageChange(p);
      setJumpInput('');
    }
  };

  const btnStyle = (disabled) => ({
    ...STYLES.btnSecondary,
    padding: '8px 14px',
    fontSize: 14,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'default' : 'pointer'
  });

  return (
    <div className="flex items-center justify-center gap-2">
      <button style={btnStyle(page <= 1)} disabled={page <= 1} onClick={() => onPageChange(1)}>首页</button>
      <button style={btnStyle(page <= 1)} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>

      <span className="text-[15px] mx-2" style={{ color: 'var(--color-ink-muted)' }}>
        第 {page} / {totalPages} 页
      </span>

      <button style={btnStyle(page >= totalPages)} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</button>
      <button style={btnStyle(page >= totalPages)} disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>末页</button>

      <span className="text-[14px] ml-2" style={{ color: 'var(--color-ink-subtle)' }}>跳转</span>
      <input
        type="number"
        value={jumpInput}
        onChange={e => setJumpInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleJump()}
        placeholder=""
        min={1}
        max={totalPages}
        style={{ width: 56, textAlign: 'center', padding: '8px 6px', fontSize: 14 }}
      />
      <button style={{ ...STYLES.btnSecondary, padding: '8px 12px', fontSize: 14 }} onClick={handleJump}>GO</button>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', placeholder, disabled, readOnly }) {
  const isLocked = disabled || readOnly;
  return (
    <div>
      <label className="block text-[14px] mb-1.5" style={{ color: isLocked ? 'var(--color-ink-tertiary)' : 'var(--color-ink-subtle)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full"
        step={type === 'number' ? 'any' : undefined}
        disabled={disabled}
        readOnly={readOnly}
        style={isLocked ? {
          cursor: 'default',
          backgroundColor: 'var(--color-surface-1)',
          color: value ? 'var(--color-ink)' : 'var(--color-ink-tertiary)',
          borderStyle: 'dashed',
          userSelect: 'none'
        } : undefined}
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[14px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
