import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import expenseRoutes from './routes/expenses.js';
import settlementRoutes from './routes/settlements.js';
import personalRoutes from './routes/personal.js';
import receiptRoutes from './routes/receipts.js';
import reportRoutes from './routes/reports.js';
import categoryRoutes from './routes/categories.js';
import userRoutes from './routes/users.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimits.js';

const app = express();

// Render/Vercel put a proxy in front, so rate limiting must read the forwarded
// IP rather than rate-limiting the proxy itself.
app.set('trust proxy', 1);

// Default CSP plus the outside origins the client really uses: Google sign-in,
// Cloudinary receipt images and Google profile pictures.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'script-src': ["'self'", 'https://accounts.google.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      'frame-src': ['https://accounts.google.com'],
      'connect-src': ["'self'", 'https://accounts.google.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://*.googleusercontent.com'],
    },
  },
}));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use('/api/v1', globalLimiter);

app.use('/api/v1', healthRoutes);
app.use('/api/v1', authRoutes);
app.use('/api/v1', groupRoutes);
app.use('/api/v1', expenseRoutes);
app.use('/api/v1', settlementRoutes);
app.use('/api/v1', personalRoutes);
app.use('/api/v1', receiptRoutes);
app.use('/api/v1', reportRoutes);
app.use('/api/v1', categoryRoutes);
app.use('/api/v1', userRoutes);

// In production the built React app is served from this same origin, so the
// SameSite=Strict refresh cookie stays first-party and CORS never comes into it.
// Any non-API path gets index.html and React Router takes over.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

export default app;
