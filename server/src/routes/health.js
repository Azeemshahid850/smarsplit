import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../utils/ok.js';

const router = Router();

router.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  ok(res, {
    status: 'up',
    db: states[mongoose.connection.readyState] ?? 'unknown',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
