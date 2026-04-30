import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'User account is deactivated' });
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
    
    const user = await User.findById(decoded.id);
    if (user && user.isActive) {
      req.user = user;
    }
    next();
  } catch (err: any) {
    // If token is invalid or expired, just proceed as anonymous
    next();
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
};
