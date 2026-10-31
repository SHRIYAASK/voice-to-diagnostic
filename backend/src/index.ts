import http from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import 'dotenv/config';

import modelsRouter from './routes/models';
import errorCodesRouter from './routes/errorCodes';
import diagnosticRouter from './routes/diagnostic';
import chatRouter from './routes/chat';
import maintenanceRouter from './routes/maintenance';
import serviceRouter from './routes/service';
import warrantyRouter from './routes/warranty';
import techniciansRouter from './routes/technicians';
import authRouter from './routes/auth';
import { voiceSessionManager } from './services/voiceSessionManager';
import { hfEvonService } from './services/hfEvonService';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/models', modelsRouter);
app.use('/api/error-codes', errorCodesRouter);
app.use('/api/diagnostic', diagnosticRouter);
app.use('/api/chat', chatRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/service', serviceRouter);
app.use('/api/warranty', warrantyRouter);
app.use('/api/technicians', techniciansRouter);
app.use('/api/auth', authRouter);

// Voice Agent status
app.get('/api/voice/status', async (_req, res) => {
  const evonHealth = await hfEvonService.checkHealth();
  res.json({
    status: 'ok',
    stt: 'Gnani Prisma v2.5 (wss://api.vachana.ai/stt/v3/stream)',
    tts: 'Gnani Timbre v2.5 (https://api.vachana.ai/api/v1/tts/sse)',
    llm: {
      modelId: hfEvonService.getModelId(),
      baseUrl: hfEvonService.getBaseUrl(),
      reachable: evonHealth.reachable,
      details: evonHealth.error || 'Configured OpenAI-compatible endpoint',
    },
    defaultLanguage: 'en-IN',
  });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error', details: err.message, stack: err.stack });
});

// Attach WebSocket Server for real-time voice pipeline
const wss = new WebSocketServer({ server, path: '/api/voice' });
wss.on('connection', (ws) => {
  voiceSessionManager.handleConnection(ws);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`✅ LG AC Diagnostic API & Voice WebSocket running on http://localhost:${PORT}`);
    console.log(`🎙️ Voice WebSocket listening on ws://localhost:${PORT}/api/voice`);
  });
}

export { app, server };
export default app;

