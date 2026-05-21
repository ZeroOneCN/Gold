const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// 获取所有出入金记录
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM capital_flows ORDER BY flow_date DESC, id DESC').all();
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN flow_type='deposit' THEN amount ELSE 0 END), 0) as total_deposit,
      COALESCE(SUM(CASE WHEN flow_type='withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawal
    FROM capital_flows
  `).get();
  res.json({ rows, ...summary });
});

// 新增出入金记录
router.post('/', (req, res) => {
  const db = getDb();
  const { flow_date, flow_type, amount, remark } = req.body;
  if (!flow_date || !flow_type || !amount || amount <= 0) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (!['deposit', 'withdrawal'].includes(flow_type)) {
    return res.status(400).json({ error: '类型仅支持 deposit/withdrawal' });
  }
  const result = db.prepare(`
    INSERT INTO capital_flows (flow_date, flow_type, amount, remark)
    VALUES (@flow_date, @flow_type, @amount, @remark)
  `).run({
    flow_date,
    flow_type,
    amount: Math.round(amount * 100) / 100,
    remark: remark || ''
  });
  res.status(201).json({ id: result.lastInsertRowid, message: '记录成功' });
});

// 更新出入金记录
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM capital_flows WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '记录不存在' });
  const { flow_date, flow_type, amount, remark } = req.body;
  if (!flow_date || !flow_type || !amount || amount <= 0) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  db.prepare('UPDATE capital_flows SET flow_date=@flow_date, flow_type=@flow_type, amount=@amount, remark=@remark WHERE id=@id').run({
    id: req.params.id,
    flow_date,
    flow_type,
    amount: Math.round(amount * 100) / 100,
    remark: remark || ''
  });
  res.json({ message: '更新成功' });
});

// 删除出入金记录
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM capital_flows WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '记录不存在' });
  res.json({ message: '已删除' });
});

module.exports = router;
