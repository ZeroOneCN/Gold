const express = require('express');
const cors = require('cors');
const path = require('path');

const tradesRouter = require('./routes/trades');
const calculatorRouter = require('./routes/calculator');
const statsRouter = require('./routes/stats');
const analysisRouter = require('./routes/analysis');
const capitalRouter = require('./routes/capital');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API 路由
app.use('/api/trades', tradesRouter);
app.use('/api/calculator', calculatorRouter);
app.use('/api/stats', statsRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/capital', capitalRouter);

// 生产环境下提供前端静态文件
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
});
