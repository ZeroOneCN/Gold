const express = require('express');
const { getDb } = require('../db');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx / .xls / .csv 格式文件'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Excel 序列号转日期字符串 (YYYY/MM/DD)
function excelDateToString(serial) {
  if (typeof serial === 'string') return serial;
  if (typeof serial === 'number') {
    const date = XLSX.SSF.parse_date_code(serial);
    return `${date.y}/${String(date.m).padStart(2, '0')}/${String(date.d).padStart(2, '0')}`;
  }
  return String(serial);
}

// Excel 序列号转时间字符串 (HH:MM:SS)
function excelTimeToString(serial) {
  if (typeof serial === 'string') return serial;
  if (typeof serial === 'number') {
    const totalSeconds = Math.round(serial * 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return String(serial);
}

// 批量导入交易记录
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传文件' });
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 查找表头行（匹配"日期时间"或"交易品种"关键字）
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row && row.some(cell => typeof cell === 'string' && (cell.includes('日期时间') || cell.includes('交易品种')))) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      return res.status(400).json({ error: '未找到表头行，请使用标准模板' });
    }

    const headers = rows[headerIndex].map(h => String(h).trim());
    const colMap = {};
    headers.forEach((h, i) => {
      if (h.includes('日期时间')) colMap.trade_date = i;
      else if (h.includes('交易品种')) colMap.instrument = i;
      else if (h.includes('订单类型')) colMap.order_type = i;
      else if (h.includes('开仓价格')) colMap.open_price = i;
      else if (h.includes('手数')) colMap.lot_size = i;
      else if (h.includes('手续费')) colMap.commission = i;
      else if (h.includes('平仓价格')) colMap.close_price = i;
      else if (h.includes('盈亏金额')) colMap.pnl = i;
      else if (h.includes('开仓时间')) colMap.open_time = i;
      else if (h.includes('平仓时间')) colMap.close_time = i;
      else if (h.includes('持仓时间')) colMap.hold_time = i;
      else if (h.includes('备注')) colMap.remark = i;
    });

    const requiredCols = ['trade_date', 'instrument', 'order_type', 'open_price', 'lot_size'];
    const missing = requiredCols.filter(c => colMap[c] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `模板缺少必填列: ${missing.join(', ')}` });
    }

    const db = getDb();
    const insert = db.prepare(`
      INSERT INTO trades (trade_date, instrument, order_type, open_price, lot_size, commission, close_price, pnl, open_time, close_time, hold_time, remark)
      VALUES (@trade_date, @instrument, @order_type, @open_price, @lot_size, @commission, @close_price, @pnl, @open_time, @close_time, @hold_time, @remark)
    `);

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors = [];

    // 预查询已存在记录的去重 key 集合
    const existingKeys = new Set(
      db.prepare("SELECT trade_date || '|' || instrument || '|' || order_type || '|' || open_price || '|' || lot_size || '|' || open_time AS key FROM trades").all().map(r => r.key)
    );

    const insertMany = db.transaction(() => {
      for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(cell => cell === undefined || cell === null || cell === '')) continue;

        try {
          const isXAG = String(row[colMap.instrument] || '').trim().toUpperCase() === 'XAGUSD';
          const pricePrecision = isXAG ? 1000 : 100;   // 价格：白银3位，其余2位
          const valPrecision = 100;                     // 盈亏/手续费/手数均2位

          const record = {
            trade_date: excelDateToString(row[colMap.trade_date]),
            instrument: String(row[colMap.instrument] || '').trim().toUpperCase(),
            order_type: String(row[colMap.order_type] || '').trim().toLowerCase(),
            open_price: Math.round((parseFloat(row[colMap.open_price]) || 0) * pricePrecision) / pricePrecision,
            lot_size: Math.round((parseFloat(row[colMap.lot_size]) || 0) * valPrecision) / valPrecision,
            commission: Math.round((parseFloat(row[colMap.commission]) || 0) * valPrecision) / valPrecision,
            close_price: colMap.close_price !== undefined ? (Math.round((parseFloat(row[colMap.close_price]) || 0) * pricePrecision) / pricePrecision || null) : null,
            pnl: colMap.pnl !== undefined ? (Math.round((parseFloat(row[colMap.pnl]) || 0) * valPrecision) / valPrecision) : null,
            open_time: colMap.open_time !== undefined ? excelTimeToString(row[colMap.open_time]) : '',
            close_time: colMap.close_time !== undefined ? excelTimeToString(row[colMap.close_time]) : '',
            hold_time: colMap.hold_time !== undefined ? String(row[colMap.hold_time] || '') : '',
            remark: colMap.remark !== undefined ? String(row[colMap.remark] || '') : ''
          };

          if (!record.trade_date || !record.instrument || !record.order_type || !record.open_price || !record.lot_size) {
            skipped++;
            continue;
          }
          if (!['buy', 'sell'].includes(record.order_type)) {
            skipped++;
            continue;
          }

          // 去重：按 日期+品种+类型+开仓价+手数+开仓时间 判断
          const dupKey = `${record.trade_date}|${record.instrument}|${record.order_type}|${record.open_price}|${record.lot_size}|${record.open_time}`;
          if (existingKeys.has(dupKey)) {
            duplicates++;
            continue;
          }

          insert.run(record);
          existingKeys.add(dupKey);
          imported++;
        } catch (rowErr) {
          skipped++;
          errors.push(`第${i + 1}行: ${rowErr.message}`);
        }
      }
    });

    insertMany();

    res.json({
      message: `导入完成（追加模式，未删除原有数据）：新增 ${imported} 条，去重跳过 ${duplicates} 条，异常跳过 ${skipped} 条`,
      imported,
      duplicates,
      skipped,
      total: imported + duplicates + skipped,
      errors: errors.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: `文件解析失败: ${err.message}` });
  }
});

// 下载导入模板
router.get('/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const header = ['ID', '日期时间', '交易品种', '订单类型', '开仓价格', '手数', '手续费', '平仓价格', '盈亏金额', '开仓时间', '平仓时间', '持仓时间', '备注'];
  const sample = [
    [1, '2026/5/20', 'XAUUSD', 'buy', 4490.59, 0.01, -0.06, 4492.07, 1.48, '00:13:00', '00:14:10', '1分10秒', ''],
    [2, '2026/5/20', 'XAUUSD', 'sell', 4495.00, 0.02, -0.12, 4492.07, 5.86, '17:00:00', '17:15:30', '15分30秒', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...sample]);
  ws['!cols'] = header.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws, '交易记录');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent('交易记录模板') + '.xlsx"');
  res.send(buf);
});

// 获取所有交易记录（支持筛选和分页）
router.get('/', (req, res) => {
  const db = getDb();
  const { instrument, order_type, start_date, end_date, page = 1, limit = 50 } = req.query;

  let where = 'WHERE 1=1';
  const params = {};

  if (instrument) {
    where += ' AND instrument = @instrument';
    params.instrument = instrument;
  }
  if (order_type) {
    where += ' AND order_type = @order_type';
    params.order_type = order_type;
  }
  if (start_date) {
    where += ' AND trade_date >= @start_date';
    params.start_date = start_date;
  }
  if (end_date) {
    where += ' AND trade_date <= @end_date';
    params.end_date = end_date;
  }

  const countSql = `SELECT COUNT(*) as cnt FROM trades ${where}`;
  const total = db.prepare(countSql).get(params);

  const sql = `SELECT * FROM trades ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`;
  params.limit = parseInt(limit);
  params.offset = (parseInt(page) - 1) * parseInt(limit);

  const trades = db.prepare(sql).all(params);

  res.json({ trades, total: total.cnt, page: parseInt(page), limit: parseInt(limit) });
});

// 获取单条交易记录
router.get('/:id', (req, res) => {
  const db = getDb();
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: '记录不存在' });
  res.json(trade);
});

// 新增交易记录
router.post('/', (req, res) => {
  const db = getDb();
  const { trade_date, instrument, order_type, open_price, lot_size, commission, close_price, pnl, open_time, close_time, hold_time, remark } = req.body;

  if (!trade_date || !instrument || !order_type || !open_price || !lot_size) {
    return res.status(400).json({ error: '缺少必填字段：日期时间、交易品种、订单类型、开仓价格、手数' });
  }

  const pricePrecision = instrument === 'XAGUSD' ? 1000 : 100;
  const valPrecision = 100;

  const result = db.prepare(`
    INSERT INTO trades (trade_date, instrument, order_type, open_price, lot_size, commission, close_price, pnl, open_time, close_time, hold_time, remark)
    VALUES (@trade_date, @instrument, @order_type, @open_price, @lot_size, @commission, @close_price, @pnl, @open_time, @close_time, @hold_time, @remark)
  `).run({
    trade_date, instrument, order_type,
    open_price: Math.round((open_price || 0) * pricePrecision) / pricePrecision,
    lot_size: Math.round((lot_size || 0) * valPrecision) / valPrecision,
    commission: Math.round((commission || 0) * valPrecision) / valPrecision,
    close_price: close_price ? Math.round(close_price * pricePrecision) / pricePrecision : null,
    pnl: pnl != null ? Math.round(pnl * valPrecision) / valPrecision : null,
    open_time: open_time || '', close_time: close_time || '', hold_time: hold_time || '', remark: remark || ''
  });

  res.status(201).json({ id: result.lastInsertRowid, message: '记录创建成功' });
});

// 更新交易记录
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const fields = ['trade_date', 'instrument', 'order_type', 'open_price', 'lot_size', 'commission', 'close_price', 'pnl', 'open_time', 'close_time', 'hold_time', 'remark'];
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = @${f}`);
  if (sets.length === 0) return res.status(400).json({ error: '无更新字段' });

  const params = { id: req.params.id };
  fields.forEach(f => { if (req.body[f] !== undefined) params[f] = req.body[f]; });

  db.prepare(`UPDATE trades SET ${sets.join(', ')} WHERE id = @id`).run(params);
  res.json({ message: '记录更新成功' });
});

// 删除交易记录
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '记录不存在' });
  res.json({ message: '记录删除成功' });
});

module.exports = router;
