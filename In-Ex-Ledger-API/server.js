const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const routes = require('./routes/index.js');
const cookieParser = require('cookie-parser');
const transactionsRouter = require('./routes/transactions.routes.js');
const { ensureCsrfCookie } = require('./middleware/csrf.middleware.js');
const { createGlobalLimiter } = require('./middleware/rateLimitTiers.js');
const { initDatabase } = require('./db.js');
const { logInfo, logWarn, logError } = require('./utils/logger.js');

const app = express();
const publicDir = path.join(process.cwd(), 'public');
const htmlDir = path.join(publicDir, 'html');
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

const PORT = process.env.PORT || 8080;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 15000);
logInfo('System start', {
  port: PORT,
  jwtSecretConfigured: !!process.env.JWT_SECRET
});

let dbState = 'starting';
let dbLastError = null;
let dbInitPromise = null;

function resolveTrustProxySetting() {
  const configured = String(process.env.TRUST_PROXY_HOPS || '').trim();
  if (!configured) {
    return 1;
  }
  const asNumber = Number(configured);
  return Number.isInteger(asNumber) && asNumber >= 0 ? asNumber : 1;
}

app.set('trust proxy', resolveTrustProxySetting());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
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
      logWarn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(cookieParser());
app.use(ensureCsrfCookie);

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
app.use('/api', createGlobalLimiter());

/* =========================================================
   SYSTEM ROUTES (HEALTH & STATIC)
   ========================================================= */

// Railway Deployment Healthcheck
app.get('/health', (req, res) => {
  const status = dbState === 'ready' ? 'healthy' : 'starting';
  const responseCode = status === 'healthy' ? 200 : 503;
  res.status(responseCode).json({ status });
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
logInfo('Mounted route', { path: '/api/transactions' });

// Core auth and index routes
app.use('/api', routes);
logInfo('Mounted route', { path: '/api' });

/* =========================================================
   404 & ERROR HANDLERS (must come after all routes)
   ========================================================= */

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logError('Unhandled error', { err: err?.message || String(err), path: req.originalUrl });
  const status = err.status || err.statusCode || 500;
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
        logInfo('Database initialization completed');
        return;
      } catch (err) {
        dbState = 'retrying';
        dbLastError = err?.message || String(err);
        logError('Database initialization failed', { err: err?.message || String(err) });
        logInfo('Retrying database initialization', { delayMs: DB_RETRY_DELAY_MS });
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
    logInfo('SIGTERM received');
    server.close(() => {
      logInfo('Server closed safely');
      process.exit(0);
    });
  });
}

async function start() {
  server = app.listen(PORT, '0.0.0.0', () => {
    logInfo('API ready', { port: PORT });
  });

  registerShutdownHandlers();
  void initializeDatabaseWithRetry();
}

start();

