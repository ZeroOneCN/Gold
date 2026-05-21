import { useState, useEffect } from 'react';

const CARD_STYLE = { backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '28px' };
const BTN_PRIMARY = { backgroundColor: 'var(--color-primary)', color: '#ffffff', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 15 };
const BTN_SECONDARY = { backgroundColor: 'var(--color-surface-1)', color: 'var(--color-ink)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '10px 20px', border: '1px solid var(--color-hairline)', cursor: 'pointer', fontSize: 15 };

const EMPTY_FORM = { flow_date: '2026/05/21', flow_type: 'deposit', amount: '', remark: '' };

export default function Capital() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total_deposit: 0, total_withdrawal: 0 });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, message: msg });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const res = await fetch('/api/capital');
      const data = await res.json();
      setRows(data.rows || []);
      setSummary({ total_deposit: data.total_deposit, total_withdrawal: data.total_withdrawal });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const netCapital = summary.total_deposit - summary.total_withdrawal;

  const handleSave = async () => {
    const url = editingId ? `/api/capital/${editingId}` : '/api/capital';
    const method = editingId ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        fetchData();
        showToast('success', editingId ? '记录更新成功' : '记录新增成功');
      } else {
        const data = await res.json();
        showToast('error', data.error || '操作失败');
      }
    } catch {
      showToast('error', '网络请求失败');
    }
  };

  const handleEdit = (row) => {
    setForm({ flow_date: row.flow_date, flow_type: row.flow_type, amount: String(row.amount), remark: row.remark || '' });
    setEditingId(row.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/capital/${id}`, { method: 'DELETE' });
      fetchData();
      showToast('success', '记录已删除');
    } catch {
      showToast('error', '删除失败');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.8px]" style={{ color: 'var(--color-ink)' }}>出入金记录</h1>
          <p className="mt-1 text-[16px]" style={{ color: 'var(--color-ink-muted)' }}>管理账户存取款，计算净值与收益率</p>
        </div>
        <button style={BTN_PRIMARY} onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>
          + 新增记录
        </button>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-3 gap-5">
        <SummaryCard label="累计入金" value={summary.total_deposit} color="var(--color-success)" prefix="+" />
        <SummaryCard label="累计出金" value={summary.total_withdrawal} color="var(--color-danger)" prefix="-" />
        <SummaryCard label="净入金" value={netCapital} color={netCapital >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} prefix={netCapital >= 0 ? '+' : ''} />
      </div>

      {/* 编辑表单 */}
      {showForm && (
        <div style={CARD_STYLE}>
          <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>{editingId ? '编辑记录' : '新增记录'}</h3>
          <div className="flex items-end gap-6 flex-wrap">
            <FormField label="日期" value={form.flow_date} onChange={v => setForm(f => ({ ...f, flow_date: v }))} width={130} />
            <FormSelect label="类型" value={form.flow_type} onChange={v => setForm(f => ({ ...f, flow_type: v }))} width={120} options={[
              { value: 'deposit', label: '入金' }, { value: 'withdrawal', label: '出金' }
            ]} />
            <FormField label="金额($)" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" width={150} />
            <div className="flex-1 min-w-[180px]">
              <FormField label="备注" value={form.remark} onChange={v => setForm(f => ({ ...f, remark: v }))} placeholder="如：初始入金" />
            </div>
            <button style={BTN_PRIMARY} onClick={handleSave}>{editingId ? '保存修改' : '保存'}</button>
            <button style={BTN_SECONDARY} onClick={() => { setShowForm(false); setEditingId(null); }}>取消</button>
          </div>
        </div>
      )}

      {/* 记录列表 */}
      <div style={CARD_STYLE}>
        <h3 className="text-[18px] font-medium mb-5" style={{ color: 'var(--color-ink)' }}>记录列表</h3>
        {rows.length > 0 ? (
          <table className="w-full text-[15px]">
            <thead>
              <tr style={{ color: 'var(--color-ink-subtle)', borderBottom: '1px solid var(--color-hairline)' }}>
                <th className="text-left py-3 px-4 font-medium">日期</th>
                <th className="text-left py-3 px-4 font-medium">类型</th>
                <th className="text-right py-3 px-4 font-medium">金额</th>
                <th className="text-left py-3 px-4 font-medium">备注</th>
                <th className="text-right py-3 px-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-hairline)' }}>
                  <td className="py-3 px-4" style={{ color: 'var(--color-ink-muted)' }}>{r.flow_date}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-1 rounded-full text-[13px] font-medium" style={{
                      backgroundColor: r.flow_type === 'deposit' ? 'color-mix(in srgb, var(--color-success) 18%, transparent)' : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                      color: r.flow_type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>{r.flow_type === 'deposit' ? '入金' : '出金'}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-medium text-[16px]" style={{ color: r.flow_type === 'deposit' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {r.flow_type === 'deposit' ? '+' : '-'}${Number(r.amount).toFixed(2)}
                  </td>
                  <td className="py-3 px-4" style={{ color: 'var(--color-ink-subtle)' }}>{r.remark || '-'}</td>
                  <td className="py-3 px-4 text-right">
                    <button style={{ background: 'none', color: 'var(--color-primary)', border: 'none', cursor: 'pointer', fontSize: 14, padding: '4px 10px' }} onClick={() => handleEdit(r)}>编辑</button>
                    <button style={{ background: 'none', color: 'var(--color-danger)', border: 'none', cursor: 'pointer', fontSize: 14, padding: '4px 10px' }} onClick={() => handleDelete(r.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[15px] py-12 text-center" style={{ color: 'var(--color-ink-subtle)' }}>暂无出入金记录，点击「新增记录」添加</p>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 right-8 z-50" style={{
          backgroundColor: toast.type === 'success' ? 'color-mix(in srgb, var(--color-success) 20%, var(--color-surface-2))' : 'color-mix(in srgb, var(--color-danger) 20%, var(--color-surface-2))',
          border: `1px solid ${toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
          borderRadius: 'var(--radius-md)', padding: '14px 22px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}>
          <span className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, prefix }) {
  return (
    <div style={{ backgroundColor: 'var(--color-surface-1)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
      <div className="text-[14px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</div>
      <div className="text-2xl font-semibold font-mono" style={{ color }}>{prefix}${Number(value).toFixed(2)}</div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', placeholder, width }) {
  return (
    <div style={width ? { width } : undefined}>
      <label className="block text-[13px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full" step={type === 'number' ? 'any' : undefined} />
    </div>
  );
}

function FormSelect({ label, value, onChange, options, width }) {
  return (
    <div style={width ? { width } : undefined}>
      <label className="block text-[13px] mb-1.5" style={{ color: 'var(--color-ink-subtle)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
