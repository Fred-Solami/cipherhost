import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { User } from '../models/types';

const SALT_ROUNDS = 12;

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.security.jwtSecret,
      { expiresIn: '24h' }
    );

    logger.info(`User ${username} logged in`);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    logger.error(`Login error: ${error}`);
    res.status(500).json({ error: 'Login failed' });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = (req as any).auth;
    const db = getDatabase();
    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(userId) as any;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error(`Get me error: ${error}`);
    res.status(500).json({ error: 'Failed to get user info' });
  }
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const users = db.prepare('SELECT id, username, role, created_at, updated_at FROM users').all();
    res.json(users);
  } catch (error) {
    logger.error(`List users error: ${error}`);
    res.status(500).json({ error: 'Failed to list users' });
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (username.length < 3 || username.length > 50) {
      res.status(400).json({ error: 'Username must be 3-50 characters' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const validRoles = ['admin', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    db.prepare(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(id, username, passwordHash, userRole);

    logger.info(`User created: ${username} (${userRole})`);
    res.status(201).json({ id, username, role: userRole });
  } catch (error) {
    logger.error(`Create user error: ${error}`);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { role, password } = req.body;
    const db = getDatabase();

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (role) {
      const validRoles = ['admin', 'viewer'];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }
      db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, userId);
    }

    if (password) {
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, userId);
    }

    logger.info(`User updated: ${user.username}`);
    res.json({ message: 'User updated' });
  } catch (error) {
    logger.error(`Update user error: ${error}`);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const authUser = (req as any).auth;
    const db = getDatabase();

    if (authUser.userId === userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any;
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;

    if (target?.role === 'admin' && adminCount.count <= 1) {
      res.status(400).json({ error: 'Cannot delete the last admin' });
      return;
    }

    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info(`User deleted: ${userId}`);
    res.json({ message: 'User deleted' });
  } catch (error) {
    logger.error(`Delete user error: ${error}`);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = (req as any).auth;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, userId);

    logger.info(`Password changed for user ${user.username}`);
    res.json({ message: 'Password changed' });
  } catch (error) {
    logger.error(`Change password error: ${error}`);
    res.status(500).json({ error: 'Failed to change password' });
  }
}
