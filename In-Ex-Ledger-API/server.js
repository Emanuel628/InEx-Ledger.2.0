const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const routes = require('./routes/index.js');
const cookieParser = require('cookie-parser');
const transactionsRouter = require('./routes/transactions.routes.js');
const { createGlobalLimiter } = require('./middleware/rateLimitTiers.js');
const {
  getRateLimiterHealth,
  initializeRateLimiterProtection
} = require('./middleware/rateLimiter.js');
const { ensureCsrfCookie } = require('./middleware/csrf.middleware.js');
const { initDatabase, migrationStats, MigrationContentDriftError } = require('./db.js');
const { getReceiptStorageStatus, initializeReceiptStorage } = require('./services/receiptStorage.js');
const { logInfo, logWarn, logError } = require('./utils/logger.js');

const app = express();
const publicDir = path.join(process.cwd(), 'public');
const htmlDir = path.join(publicDir, 'html');
let globalLimiter = null;
const htmlPageNames = fs.readdirSync(htmlDir)
  .filter((name) => name.toLowerCase().endsWith('.html'))
  .map((name) => path.basename(name, '.html'));
const LEGACY_HTML_REDIRECTS = new Map([
  ['/landing.html', '/'],
  ['/html/account-profile.html', '/settings#settings-business'],
  ['/account-profile.html', '/settings#settings-business'],
  ['/html/business-profile.html', '/settings#settings-business'],
  ['/business-profile.html', '/settings#settings-business'],
  ['/html/fiscal-settings.html', '/settings#settings-business'],
  ['/fiscal-settings.html', '/settings#settings-business'],
  ['/html/region-settings.html', '/settings#settings-preferences'],
  ['/region-settings.html', '/settings#settings-preferences'],
  ['/html/security.html', '/settings#settings-security'],
  ['/security.html', '/settings#settings-security'],
  ['/html/sessions.html', '/sessions'],
  ['/sessions.html', '/sessions'],
  ['/html/mfa.html', '/settings#settings-security'],
  ['/mfa.html', '/settings#settings-security']
]);

function setNoCacheHtmlHeaders(res, filePath) {
  if (!String(filePath || '').toLowerCase().endsWith('.html')) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function getCanonicalPagePath(pageName) {
  return pageName === 'landing' ? '/' : `/${pageName}`;
}

function sendCanonicalPage(pageName, req, res) {
  const fileName = `${pageName}.html`;
  const filePath = path.join(htmlDir, fileName);
  setNoCacheHtmlHeaders(res, filePath);
  res.sendFile(filePath);
}

/* =========================================================
   CORS & SECURITY CONFIGURATION
   ========================================================= */
const ALLOWED_ORIGINS = [
  'https://inexledger.com',
  'https://www.inexledger.com',
  'https://inex-ledger20-production.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

console.log('SYSTEM START: INEX_LEDGER_PROD_2026');

const PORT = process.env.PORT || 8080;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 15000);
logInfo(`NETWORK: Port assigned: ${PORT}`);
logInfo('SECURITY: JWT_SECRET detected:', { detected: !!process.env.JWT_SECRET });

let dbState = 'starting';
let dbLastError = null;
let dbInitPromise = null;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server or local testing with no origin
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logWarn(`CORS: Blocked request from ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

/* =========================================================
   MIDDLEWARE STACK
   ========================================================= */
for (const [legacyPath, nextPath] of LEGACY_HTML_REDIRECTS.entries()) {
  app.get(legacyPath, (req, res) => {
    res.redirect(302, nextPath);
  });
}
for (const pageName of htmlPageNames) {
  const canonicalPath = getCanonicalPagePath(pageName);
  if (pageName === 'landing') {
    app.get('/landing', (req, res) => {
      res.redirect(301, '/');
    });
    app.get('/html/landing', (req, res) => {
      res.redirect(301, '/');
    });
    app.get('/html/landing.html', (req, res) => {
      res.redirect(301, '/');
    });
    continue;
  }

  app.get(canonicalPath, (req, res) => {
    sendCanonicalPage(pageName, req, res);
  });
  app.get(`/html/${pageName}`, (req, res) => {
    res.redirect(301, canonicalPath);
  });
  app.get(`/html/${pageName}.html`, (req, res) => {
    res.redirect(301, canonicalPath);
  });
  app.get(`/${pageName}.html`, (req, res) => {
    res.redirect(301, canonicalPath);
  });
}
app.use(cookieParser());
app.use(ensureCsrfCookie);
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use('/html', express.static(htmlDir, {
  index: false,
  setHeaders: setNoCacheHtmlHeaders
}));
app.use(express.static(publicDir, {
  index: false,
  setHeaders: setNoCacheHtmlHeaders
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/api', (req, res, next) => {
  const rateLimiting = getRateLimiterHealth();
  if (rateLimiting.required && !rateLimiting.available) {
    return res.status(503).json({
      error: 'Service temporarily unavailable due to rate limiting requirements.'
    });
  }
  if (dbState === 'failed') {
    return res.status(503).json({
      error: 'Service unavailable due to a database initialization error. Please contact support.',
      database: { state: dbState }
    });
  }
  if (dbState !== 'ready') {
    return res.status(503).json({
      error: 'Service starting up. Please try again shortly.',
      database: { state: dbState }
    });
  }
  if (!globalLimiter) {
    globalLimiter = createGlobalLimiter();
  }
  return globalLimiter(req, res, next);
});

/* =========================================================
   SYSTEM ROUTES (HEALTH & STATIC)
   ========================================================= */

// Railway Deployment Healthcheck
app.get('/health', (req, res) => {
  const rateLimiting = getRateLimiterHealth();
  const receiptStorage = getReceiptStorageStatus();
  const healthy = dbState === 'ready' && rateLimiting.mode !== 'degraded' && receiptStorage.mode !== 'degraded';
  let overallStatus;
  if (healthy) {
    overallStatus = 'healthy';
  } else if (dbState === 'ready') {
    overallStatus = 'degraded';
  } else {
    overallStatus = dbState;
  }
  res.status(200).json({
    status: overallStatus,
    database: {
      state: dbState,
      lastError: dbLastError,
      migrations: migrationStats
    },
    receiptStorage,
    rateLimiting,
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
  sendCanonicalPage('landing', req, res);
});

app.get('/index.html', (req, res) => {
  res.redirect(301, '/');
});

/* =========================================================
   API ROUTES
   ========================================================= */

// Transaction management
app.use('/api/transactions', transactionsRouter);
logInfo('MOUNTED: /api/transactions');

// Core auth and index routes
app.use('/api', routes);
logInfo('MOUNTED: /api (Core Routes)');

/* =========================================================
   404 & ERROR HANDLERS (must come after all routes)
   ========================================================= */

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  logError('Unhandled error', {
    status,
    method: req.method,
    path: req.path,
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
  const message = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

/* =========================================================
   SERVER INITIALIZATION
   ========================================================= */

let server;

async function initializeDatabaseWithRetry() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    while (true) {
      try {
        await initDatabase();
        dbState = 'ready';
        dbLastError = null;
        logInfo('Database initialization completed.');
        return;
      } catch (err) {
        const message = err?.message || String(err);
        // Content-drift errors are programmer mistakes that will never self-heal
        // — retrying endlessly is pointless and noisy.
        if (err instanceof MigrationContentDriftError) {
          dbState = 'failed';
          dbLastError = message;
          logError('Database initialization failed with a non-retryable error. Manual intervention required.', { message });
          return;
        }
        dbState = 'retrying';
        dbLastError = message;
        logError('Database initialization failed:', { message });
        logInfo(`Retrying database initialization in ${DB_RETRY_DELAY_MS}ms.`);
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
      }
    }
  })();

  return dbInitPromise;
}

function registerShutdownHandlers() {

  /* =========================================================
     GRACEFUL SHUTDOWN
     ========================================================= */

  process.on('SIGTERM', () => {
    logInfo('SIGTERM: Shutdown signal received.');
    server.close(() => {
      logInfo('Server closed safely.');
      process.exit(0);
    });
  });
}

async function start() {
  initializeReceiptStorage();
  try {
    await initializeRateLimiterProtection();
  } catch (err) {
    logError('Rate limiting initialization failed', {
      message: err?.message || String(err)
    });
    logWarn('Rate limiting is unavailable; API requests will fail closed until restored.');
  }
  server = app.listen(PORT, '0.0.0.0', () => {
    logInfo(`READY: InEx Ledger API live on port ${PORT}`);
  });

  registerShutdownHandlers();
  void initializeDatabaseWithRetry();
}

start().catch((err) => {
  logError('Server startup failed', { message: err?.message || String(err) });
  process.exit(1);
});
