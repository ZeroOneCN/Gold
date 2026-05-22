const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// DeepSeek API 分析
router.post('/analyze', async (req, res) => {
  const { start_date, end_date } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: '请选择分析日期范围' });
  }

  const db = getDb();

  // 获取日期范围内的交易记录
  const trades = db.prepare(`
    SELECT * FROM trades
    WHERE trade_date >= ? AND trade_date <= ? AND pnl IS NOT NULL
    ORDER BY trade_date ASC, open_time ASC
  `).all(start_date, end_date);

  if (trades.length === 0) {
    return res.json({ conclusion: '所选日期范围内无交易记录，无法分析。' });
  }

  // 汇总统计
  const totalTrades = trades.length;
  const totalPnlNum = trades.reduce((s, t) => s + Number(t.pnl), 0);
  const totalPnl = totalPnlNum.toFixed(2);
  const winTrades = trades.filter(t => (Number(t.pnl)) > 0);
  const lossTrades = trades.filter(t => (Number(t.pnl)) < 0);
  const winCount = winTrades.length;
  const lossCount = lossTrades.length;
  const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0';
  const avgWinNum = winCount > 0 ? (winTrades.reduce((s, t) => s + Number(t.pnl), 0) / winCount) : 0;
  const avgLossNum = lossCount > 0 ? (lossTrades.reduce((s, t) => s + Number(t.pnl), 0) / lossCount) : 0;
  const avgWin = avgWinNum.toFixed(2);
  const avgLoss = avgLossNum.toFixed(2);
  const profitLossRatio = avgLossNum !== 0 ? (Math.abs(avgWinNum / avgLossNum)).toFixed(2) : '0';

  // 品种统计
  const byInstrument = {};
  trades.forEach(t => {
    const netPnl = Number(t.pnl);
    if (!byInstrument[t.instrument]) {
      byInstrument[t.instrument] = { total: 0, win: 0, loss: 0, pnl: 0 };
    }
    byInstrument[t.instrument].total++;
    byInstrument[t.instrument].pnl += netPnl;
    if (netPnl > 0) byInstrument[t.instrument].win++;
    else if (netPnl < 0) byInstrument[t.instrument].loss++;
  });

  // 构建交易摘要，每条精简为一行
  const tradesSummary = trades.map(t => {
    const netPnl = Number(t.pnl);
    const type = t.order_type === 'buy' ? '多' : '空';
    const pnlSign = netPnl > 0 ? '+' : '';
    return `${t.trade_date} ${t.open_time} ${t.instrument} ${type} 开${t.open_price} 平${t.close_price} 盈${pnlSign}${netPnl.toFixed(2)}`;
  }).join('\n');

  const instrumentStats = Object.entries(byInstrument).map(([k, v]) =>
    `${k}: ${v.total}笔 盈${v.win}亏${v.loss} 净${Number(v.pnl).toFixed(2)}`
  ).join('\n');

  const prompt = `你是一名拥有多年实操经验的外汇分析师交易员。请根据以下交易记录进行客观分析，给出结论和建议。

## 交易时段
${start_date} 至 ${end_date}，共 ${totalTrades} 笔交易

## 核心指标
- 总盈亏：$${totalPnl}
- 胜率：${winRate}%（${winCount}赢/${lossCount}亏）
- 平均盈利：$${avgWin}，平均亏损：$${avgLoss}
- 盈亏比：${profitLossRatio}

## 品种表现
${instrumentStats}

## 逐笔记录
${tradesSummary}

请从以下维度分析（用中文，简洁有力，控制在300字以内）：
1. 整体表现评价
2. 主要问题/优势
3. 品种偏好建议
4. 风险控制建议`;

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY 环境变量' });
    }

    const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一名拥有多年实操经验的外汇分析师交易员。回复使用中文，简洁有力。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(500).json({ error: `DeepSeek API 调用失败: ${aiRes.status} ${errText}` });
    }

    const aiData = await aiRes.json();
    const conclusion = aiData.choices?.[0]?.message?.content || 'AI 未返回有效分析结果';

    res.json({
      conclusion,
      stats: {
        total_trades: totalTrades,
        total_pnl: totalPnl,
        win_rate: winRate,
        win_count: winCount,
        loss_count: lossCount,
        avg_win: avgWin,
        avg_loss: avgLoss,
        profit_loss_ratio: profitLossRatio
      }
    });
  } catch (err) {
    res.status(500).json({ error: `分析请求失败: ${err.message}` });
  }
});

module.exports = router;
