const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const routes = require('./routes/index.js');
const cookieParser = require('cookie-parser');
const transactionsRouter = require('./routes/transactions.routes.js');
const { requireAuth } = require('./middleware/auth.middleware.js');
const { initDatabase } = require('./db.js');

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

console.log('SYSTEM START: INEX_LEDGER_PROD_2026');

const PORT = process.env.PORT || 8080;
console.log(`NETWORK: Port assigned: ${PORT}`);
console.log('SECURITY: JWT_SECRET detected:', !!process.env.JWT_SECRET);

app.set('trust proxy', 1);

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
      console.warn(`CORS: Blocked request from ${origin}`);
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
console.log('MOUNTED: /api/transactions');

// Core auth and index routes
app.use('/api', routes);
console.log('MOUNTED: /api (Core Routes)');

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
    console.log(`READY: InEx Ledger API live on port ${PORT}`);
  });

  /* =========================================================
     GRACEFUL SHUTDOWN
     ========================================================= */

  process.on('SIGTERM', () => {
    console.log('SIGTERM: Shutdown signal received.');
    server.close(() => {
      console.log('Server closed safely.');
      process.exit(0);
    });
  });
}

start();

