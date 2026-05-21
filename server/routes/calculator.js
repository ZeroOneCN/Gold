const express = require('express');
const router = express.Router();

// 合约规格
const CONTRACTS = {
  XAUUSD: { name: '黄金/美元', lot_units: 100, min_lot: 0.01, max_lot: 100 },
  XAGUSD: { name: '白银/美元', lot_units: 5000, min_lot: 0.01, max_lot: 100 }
};

// 计算器接口
router.post('/compute', (req, res) => {
  const {
    instrument = 'XAUUSD',
    order_type = 'buy',
    open_price,
    lot_size,
    leverage = 100,
    balance = 0,
    close_price = null,
    forced_liquidation_ratio = 0.5  // 强平比例默认50%
  } = req.body;

  const contract = CONTRACTS[instrument];
  if (!contract) return res.status(400).json({ error: '不支持的交易品种，仅支持 XAUUSD 和 XAGUSD' });
  if (!open_price || open_price <= 0) return res.status(400).json({ error: '请输入有效的开仓价格' });
  if (!lot_size || lot_size < contract.min_lot) return res.status(400).json({ error: `最小手数为 ${contract.min_lot}` });

  // 合约价值 = 开仓价格 × 手数 × 合约单位
  const contract_value = open_price * lot_size * contract.lot_units;

  // 保证金 = 合约价值 / 杠杆
  const margin = contract_value / leverage;

  // 点值（1点 = 手数 × 合约单位 × 最小变动单位）
  const point_value = lot_size * contract.lot_units * 0.01;

  // 盈亏计算
  let pnl = null;
  if (close_price && close_price > 0) {
    if (order_type === 'buy') {
      pnl = (close_price - open_price) * lot_size * contract.lot_units;
    } else {
      pnl = (open_price - close_price) * lot_size * contract.lot_units;
    }
  }

  // 保证金比例 = 净值 / 已用保证金 × 100%
  const equity = balance + (pnl || 0);
  const margin_ratio = margin > 0 ? (equity / margin) * 100 : 0;

  // 强平价计算
  let forced_liquidation_price = null;
  if (margin > 0) {
    const fl_equity = forced_liquidation_ratio * margin;
    if (order_type === 'buy') {
      forced_liquidation_price = open_price - (equity - fl_equity) / (lot_size * contract.lot_units);
    } else {
      forced_liquidation_price = open_price + (equity - fl_equity) / (lot_size * contract.lot_units);
    }
    forced_liquidation_price = Math.max(0, forced_liquidation_price);
  }

  res.json({
    instrument: contract.name,
    order_type: order_type === 'buy' ? '做多' : '做空',
    open_price,
    lot_size,
    leverage,
    contract_value: Math.round(contract_value * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    point_value: Math.round(point_value * 100) / 100,
    pnl: pnl !== null ? Math.round(pnl * 100) / 100 : null,
    equity: Math.round(equity * 100) / 100,
    margin_ratio: Math.round(margin_ratio * 100) / 100,
    forced_liquidation_price: forced_liquidation_price !== null ? Math.round(forced_liquidation_price * 100) / 100 : null,
    forced_liquidation_ratio,
    balance
  });
});

// 多仓位共同计算
router.post('/compute-multi', (req, res) => {
  const {
    positions = [],
    leverage = 500,
    balance = 0,
    forced_liquidation_ratio = 0.5
  } = req.body;

  if (!Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json({ error: '请至少添加一个仓位' });
  }

  const results = [];
  let totalMargin = 0;
  let totalContractValue = 0;
  let totalPnl = 0;
  let hasPnl = false;

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const { instrument = 'XAUUSD', order_type = 'buy', open_price, lot_size, close_price = null } = pos;

    const contract = CONTRACTS[instrument];
    if (!contract) return res.status(400).json({ error: `仓位${i + 1}: 不支持的交易品种` });
    if (!open_price || open_price <= 0) return res.status(400).json({ error: `仓位${i + 1}: 请输入有效的开仓价格` });
    if (!lot_size || lot_size < contract.min_lot) return res.status(400).json({ error: `仓位${i + 1}: 最小手数为 ${contract.min_lot}` });

    const contract_value = open_price * lot_size * contract.lot_units;
    const margin = contract_value / leverage;
    const point_value = lot_size * contract.lot_units * 0.01;

    let pnl = null;
    if (close_price && close_price > 0) {
      hasPnl = true;
      if (order_type === 'buy') {
        pnl = (close_price - open_price) * lot_size * contract.lot_units;
      } else {
        pnl = (open_price - close_price) * lot_size * contract.lot_units;
      }
    }

    totalContractValue += contract_value;
    totalMargin += margin;
    if (pnl !== null) totalPnl += pnl;

    results.push({
      index: i + 1,
      instrument: contract.name,
      order_type: order_type === 'buy' ? '做多' : '做空',
      open_price,
      lot_size,
      close_price,
      contract_value: Math.round(contract_value * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      point_value: Math.round(point_value * 100) / 100,
      pnl: pnl !== null ? Math.round(pnl * 100) / 100 : null
    });
  }

  // 汇总计算
  const equity = balance + totalPnl;
  const totalMarginRatio = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;

  res.json({
    positions: results,
    summary: {
      position_count: results.length,
      total_contract_value: Math.round(totalContractValue * 100) / 100,
      total_margin: Math.round(totalMargin * 100) / 100,
      total_pnl: hasPnl ? Math.round(totalPnl * 100) / 100 : null,
      leverage,
      balance,
      equity: Math.round(equity * 100) / 100,
      margin_ratio: Math.round(totalMarginRatio * 100) / 100,
      forced_liquidation_ratio
    }
  });
});

// 获取合约信息
router.get('/contracts', (req, res) => {
  res.json(CONTRACTS);
});

module.exports = router;
