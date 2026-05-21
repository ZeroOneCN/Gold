const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// 获取统计数据概览
router.get('/overview', (req, res) => {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as cnt FROM trades').get();
  const pnlStats = db.prepare('SELECT SUM(pnl) as total_pnl, AVG(pnl) as avg_pnl, SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as win_count, SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as loss_count FROM trades WHERE pnl IS NOT NULL').get();
  const winLossAmounts = db.prepare('SELECT AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_win, AVG(CASE WHEN pnl < 0 THEN pnl END) as avg_loss FROM trades WHERE pnl IS NOT NULL').get();
  const commissionStats = db.prepare('SELECT SUM(commission) as total_commission FROM trades').get();
  const instrumentStats = db.prepare(`
    SELECT instrument, COUNT(*) as cnt, SUM(pnl) as total_pnl, AVG(pnl) as avg_pnl,
           SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as win_count,
           SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as loss_count
    FROM trades WHERE pnl IS NOT NULL
    GROUP BY instrument
  `).all();

  const buyStats = db.prepare(`
    SELECT COUNT(*) as cnt, SUM(pnl) as total_pnl, AVG(pnl) as avg_pnl
    FROM trades WHERE order_type = 'buy' AND pnl IS NOT NULL
  `).get();

  const sellStats = db.prepare(`
    SELECT COUNT(*) as cnt, SUM(pnl) as total_pnl, AVG(pnl) as avg_pnl
    FROM trades WHERE order_type = 'sell' AND pnl IS NOT NULL
  `).get();

  const totalTrades = total.cnt;
  const winCount = pnlStats.win_count || 0;
  const lossCount = pnlStats.loss_count || 0;
  const winRate = totalTrades > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;

  const avgWin = Math.round((winLossAmounts.avg_win || 0) * 100) / 100;
  const avgLoss = Math.round((winLossAmounts.avg_loss || 0) * 100) / 100;
  const profitLossRatio = avgLoss !== 0 ? Math.round((avgWin / Math.abs(avgLoss)) * 100) / 100 : 0;

  const totalPnlNum = Math.round((pnlStats.total_pnl || 0) * 100) / 100;
  const totalCommission = Math.round((commissionStats.total_commission || 0) * 100) / 100;

  // 出入金统计
  const capitalSummary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN flow_type='deposit' THEN amount ELSE 0 END), 0) as total_deposit,
      COALESCE(SUM(CASE WHEN flow_type='withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawal
    FROM capital_flows
  `).get();
  const totalDeposit = Math.round((capitalSummary.total_deposit || 0) * 100) / 100;
  const totalWithdrawal = Math.round((capitalSummary.total_withdrawal || 0) * 100) / 100;
  const netCapital = Math.round((totalDeposit - totalWithdrawal) * 100) / 100;
  // 净值 = 净入金 + 交易盈亏 + 手续费
  const equity = Math.round((netCapital + totalPnlNum + totalCommission) * 100) / 100;
  const roi = netCapital > 0 ? Math.round(((totalPnlNum + totalCommission) / netCapital) * 10000) / 100 : 0;

  res.json({
    total_trades: totalTrades,
    total_pnl: totalPnlNum,
    avg_pnl: Math.round((pnlStats.avg_pnl || 0) * 100) / 100,
    total_commission: totalCommission,
    win_count: winCount,
    loss_count: lossCount,
    win_rate: Math.round(winRate * 100) / 100,
    avg_win: avgWin,
    avg_loss: avgLoss,
    profit_loss_ratio: profitLossRatio,
    by_instrument: instrumentStats.map(s => ({
      ...s,
      total_pnl: Math.round(s.total_pnl * 100) / 100,
      avg_pnl: Math.round(s.avg_pnl * 100) / 100,
      win_rate: (s.win_count + s.loss_count) > 0 ? Math.round((s.win_count / (s.win_count + s.loss_count)) * 10000) / 100 : 0
    })),
    buy: {
      count: buyStats.cnt,
      total_pnl: Math.round((buyStats.total_pnl || 0) * 100) / 100,
      avg_pnl: Math.round((buyStats.avg_pnl || 0) * 100) / 100
    },
    sell: {
      count: sellStats.cnt,
      total_pnl: Math.round((sellStats.total_pnl || 0) * 100) / 100,
      avg_pnl: Math.round((sellStats.avg_pnl || 0) * 100) / 100
    },
    capital: {
      total_deposit: totalDeposit,
      total_withdrawal: totalWithdrawal,
      net_capital: netCapital,
      equity: equity,
      roi: roi
    }
  });
});

// 按日期汇总盈亏（补全无交易日期的零点）
router.get('/daily-pnl', (req, res) => {
  const db = getDb();
  const dailyData = db.prepare(`
    SELECT trade_date, COUNT(*) as cnt, SUM(pnl) as total_pnl, SUM(commission) as total_commission
    FROM trades WHERE pnl IS NOT NULL
    GROUP BY trade_date ORDER BY trade_date ASC
  `).all();

  // 补全日期范围内缺失的日期
  if (dailyData.length === 0) return res.json([]);

  const dateMap = {};
  dailyData.forEach(d => {
    dateMap[d.trade_date] = {
      trade_date: d.trade_date,
      cnt: d.cnt,
      total_pnl: Math.round(d.total_pnl * 100) / 100,
      total_commission: Math.round(d.total_commission * 100) / 100
    };
  });

  // 解析日期为 Date 对象
  const parseDate = (str) => {
    const [y, m, d] = str.split('/').map(Number);
    return new Date(y, m - 1, d);
  };
  const formatDate = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

  const dates = Object.keys(dateMap).sort();
  const start = parseDate(dates[0]);
  const end = parseDate(dates[dates.length - 1]);

  const filled = [];
  const cur = new Date(start);
  while (cur <= end) {
    const key = formatDate(cur);
    filled.push(dateMap[key] || { trade_date: key, cnt: 0, total_pnl: 0, total_commission: 0 });
    cur.setDate(cur.getDate() + 1);
  }

  // 前端用 reverse 显示最新在前
  res.json(filled);
});

module.exports = router;
