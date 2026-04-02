const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const routes = require('./routes/index.js');
const cookieParser = require('cookie-parser');
const transactionsRouter = require('./routes/transactions.routes.js');
const { requireAuth } = require('./middleware/auth.middleware.js');
const { initDatabase } = require('./db.js');

const app = express();
const publicDir = path.join(process.cwd(), 'public');

/* =========================================================
   CORS & SECURITY CONFIGURATION
   ========================================================= */
const ALLOWED_ORIGINS = [
  'https://inexledger.com',
  'https://www.inexledger.com',
  'https://inex-ledger20-production.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
  null
];

console.log('🔥 SYSTEM START: INEX_LEDGER_PROD_2026');

const PORT = process.env.PORT || 8080;
console.log(`📡 NETWORK: Port assigned: ${PORT}`);
console.log('🔒 SECURITY: JWT_SECRET detected:', !!process.env.JWT_SECRET);

app.use(helmet({
  contentSecurityPolicy: false  // disabled to allow inline scripts in the existing frontend
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server or local testing with no origin
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS: Blocked request from ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

/* =========================================================
   MIDDLEWARE STACK
   ========================================================= */
app.use(express.static(publicDir));
app.use(express.static(path.join(publicDir, 'html')));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

/* =========================================================
   SYSTEM ROUTES (HEALTH & STATIC)
   ========================================================= */

// Railway Deployment Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/favicon.ico', (req, res) => {
  res.redirect(301, '/favicon.svg');
});

app.get('/favicon.svg', (req, res) => {
  res.sendFile(path.join(publicDir, 'favicon.svg'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'html', 'landing.html'));
});

/* =========================================================
   API ROUTES
   ========================================================= */

// Transaction management
app.use('/api/transactions', transactionsRouter);
console.log('✅ MOUNTED: /api/transactions');

// Core auth and index routes
app.use('/api', routes);
console.log('✅ MOUNTED: /api (Core Routes)');

/* =========================================================
   SERVER INITIALIZATION
   ========================================================= */

let server;

async function start() {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 READY: InEx Ledger API live on port ${PORT}`);
  });

  /* =========================================================
     GRACEFUL SHUTDOWN
     ========================================================= */

  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM: Shutdown signal received.');
    server.close(() => {
      console.log('💥 Server closed safely. Goodbye!');
      process.exit(0);
    });
  });
}

start();