import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config';
import { initDatabase } from './config/database';
import { logger } from './utils/logger';
import { localhostOnly, authMiddleware } from './middleware/auth';
import { login } from './controllers/auth-controller';
import { handleWebhook } from './controllers/webhook-controller';
import { HealthMonitor } from './services/health-monitor';
import { CaddyManager } from './services/caddy-manager';
import fs from 'fs';
import path from 'path';

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time log streaming
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  logger.info('WebSocket client connected');

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'subscribe' && data.projectId) {
        (ws as any).projectId = data.projectId;
        logger.debug(`Client subscribed to logs for project ${data.projectId}`);
      }
    } catch {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    logger.debug('WebSocket client disconnected');
  });
});

// Broadcast log message to clients subscribed to a project
export function broadcastLog(projectId: string, log: { type: string; message: string; timestamp: string }) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const subscribedId = (client as any).projectId;
      if (!subscribedId || subscribedId === projectId) {
        client.send(JSON.stringify({ projectId, ...log }));
      }
    }
  });
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply localhost-only restriction in production
if (config.server.nodeEnv === 'production') {
  app.use(localhostOnly);
}

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: 'CipherHost Controller',
    version: '1.0.0',
    status: 'running',
  });
});

function ensureDirectories() {
  const dirs = [
    config.deployment.appsBaseDir,
    config.deployment.snapshotsDir,
    path.dirname(config.database.path),
    path.join(__dirname, '../logs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  }
}

async function startServer() {
  try {
    ensureDirectories();

    initDatabase();
    logger.info('Database initialized');

    // Seed default admin user if no users exist
    await seedDefaultAdmin();

    // Public login route (no auth required)
    app.post('/api/auth/login', login);

    // Public webhook endpoint (uses its own signature verification)
    app.post('/api/webhooks/:projectId', handleWebhook);

    // Import routes AFTER database is initialized
    const routes = await import('./routes');
    
    // Apply auth middleware to API routes
    app.use('/api', authMiddleware, routes.default);

    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
      res.status(500).json({ error: 'Internal server error' });
    });

    server.listen(config.server.port, () => {
      logger.info(`CipherHost Controller running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info(`Apps directory: ${config.deployment.appsBaseDir}`);
      logger.info(`WebSocket server running on ws://localhost:${config.server.port}/ws`);
    });

    // Post-startup: initialize Caddy base config and resume health monitors
    const caddy = new CaddyManager();
    await caddy.ensureBaseConfig();

    const healthMonitor = new HealthMonitor();
    healthMonitor.resumeAllMonitors();
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

async function seedDefaultAdmin() {
  const bcrypt = await import('bcrypt');
  const { v4: uuidv4 } = await import('uuid');
  const { getDatabase } = await import('./config/database');

  const db = getDatabase();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;

  if (userCount.count === 0) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash('admin123', 12);
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(id, 'admin', passwordHash, 'admin');
    logger.info('Default admin user created (username: admin, password: admin123) — CHANGE THIS!');
  }
}

startServer();
