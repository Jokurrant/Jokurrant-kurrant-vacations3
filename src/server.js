const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Try multiple .env locations in order of priority:
// 1. User home directory (persists across GitHub deploys)
// 2. Domain root (outside public_html but inside domain folder)
// 3. Project root (public_html - local dev / manual deploy)
const envPaths = [
  '/home/u655822750/domains/vacationsenv/.env',                 // Domain root (where you uploaded!)
  path.join(__dirname, '../.env'),                                                            // Project root
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✅ Loaded .env file from:', envPath);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('⚠️ No .env file found, using system environment variables');
  console.log('   Searched:', envPaths.join(', '));
}

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const vacationRoutes = require('./routes/vacations');
const blackoutRoutes = require('./routes/blackouts');
const activityRoutes = require('./routes/activity');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

// Rate limiting - general API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (generous)
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Stricter rate limit for login attempts only (POST)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login attempts per 15 minutes
  message: { error: 'Too many login attempts, please wait 15 minutes' },
  skipSuccessfulRequests: true, // Don't count successful logins
  skip: (req) => req.method !== 'POST' // Only limit POST requests
});
app.use('/api/auth/login', authLimiter);

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// DEBUG: Temporary env check route - REMOVE AFTER DEBUGGING
app.get('/__envcheck', (req, res) => {
  const envPaths = [
    '/home/u655822750/.env',
    '/home/u655822750/domains/dodgerblue-otter-705031.hostingersite.com/.env',
    path.join(__dirname, '../.env'),
  ];
  
  res.json({
    nodeEnv: process.env.NODE_ENV,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasDbHost: !!process.env.DB_HOST,
    hasDbUser: !!process.env.DB_USER,
    hasDbPassword: !!process.env.DB_PASSWORD,
    hasDbName: !!process.env.DB_NAME,
    envFilesChecked: envPaths.map(p => ({ path: p, exists: fs.existsSync(p) })),
    cwd: process.cwd(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vacations', vacationRoutes);
app.use('/api/blackouts', blackoutRoutes);
app.use('/api/activity', activityRoutes);

// Serve static files (React frontend)
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all: serve React app for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Kurrant TimeOff Server Running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: http://localhost:${PORT}
🔐 Environment: ${process.env.NODE_ENV || 'development'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

module.exports = app;
