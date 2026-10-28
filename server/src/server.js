import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import auth from './routes/auth.js';
import incidents from './routes/incidents.js';
import evidence from './routes/evidence.js';
import audit from './routes/audit.js';
import users from './routes/users.js';
import dashboard from './routes/dashboard.js';
import reports from './routes/reports.js';
import snmp from './routes/snmp.js';
import { notFound, errorHandler } from './middleware.js';
import { startSnmpMonitor } from './snmp.js';
import { resolveJwtSecret } from './config.js';

resolveJwtSecret();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || false, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  skip: req => req.method === 'GET' && req.path === '/api/snmp/status',
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'CyberIncident API',
  time: new Date().toISOString()
}));

app.use('/api/auth', auth);
app.use('/api/dashboard', dashboard);
app.use('/api/incidents', incidents);
app.use('/api/evidence', evidence);
app.use('/api/audit', audit);
app.use('/api/users', users);
app.use('/api/reports', reports);
app.use('/api/snmp', snmp);

app.use(express.static(clientDist, { index: false }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), error => {
    if (error) next(error);
  });
});

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`CyberIncident : http://${host}:${port}`);
  startSnmpMonitor();
});

function shutdown(signal) {
  console.log(`[SYSTEM] arrêt demandé (${signal})`);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
