// server.js — Main entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs-extra');

const askRouter = require('./routes/ask');
const uploadRouter = require('./routes/upload');
const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — 60 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Ensure uploads directory exists
fs.ensureDirSync(path.join(__dirname, 'uploads'));

// ─── Routes ──────────────────────────────────────────────────
app.use('/api', askRouter);
app.use('/api', uploadRouter);
app.use('/api', healthRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`✅ AI Knowledge Assistant running on http://localhost:${PORT}`);
  console.log(`📡 n8n webhook target: ${process.env.N8N_WEBHOOK_URL}`);
});

module.exports = app;
