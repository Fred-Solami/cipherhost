import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { UserRole } from '../models/types';

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Skip auth for health check endpoint
  if (req.path === '/health' || req.path === '/') {
    next();
    return;
  }

  // Try JWT token first (Authorization: Bearer <token>)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, config.security.jwtSecret) as {
        userId: string;
        username: string;
        role: UserRole;
      };
      (req as any).auth = payload;
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  // Fall back to API key (for external/script access)
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    logger.warn(`Unauthorized access attempt from ${req.ip}`);
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (apiKey !== config.security.apiKey) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  // API key users get admin access
  (req as any).auth = { userId: 'api-key', username: 'api-key', role: 'admin' };
  next();
};

// Role-based access control middleware
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as any).auth;
    if (!auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(auth.role)) {
      logger.warn(`Access denied for user ${auth.username} (role: ${auth.role}), required: ${roles.join(', ')}`);
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

// Middleware to restrict access to localhost only
export const localhostOnly = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.socket.remoteAddress || '';
  
  // Allow localhost, 127.0.0.1, ::1 (IPv6 localhost), and ::ffff:127.0.0.1 (IPv4-mapped IPv6)
  const isLocalhost = 
    ip === '127.0.0.1' || 
    ip === '::1' || 
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('127.') ||
    ip.startsWith('::ffff:127.');

  if (!isLocalhost && config.server.nodeEnv === 'production') {
    logger.warn(`Access denied from non-localhost IP: ${ip}`);
    res.status(403).json({ error: 'Access denied. CipherHost is only accessible from localhost.' });
    return;
  }

  next();
};
