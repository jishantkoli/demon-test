import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

const generateTokens = (user: any) => {
  const payload = { 
    id: user._id, 
    role: user.role, 
    schoolCode: user.profile?.schoolCode 
  };
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log(`Login attempt for: ${normalizedEmail}`);
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    
    if (!user) {
      console.log(`User not found: ${normalizedEmail}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await (user as any).comparePassword(password);
    console.log(`Password match for ${normalizedEmail}: ${isMatch}`);

    if (!isMatch) {
      await AuditLog.create({
        action: 'login_failed',
        metadata: { email: normalizedEmail, ip: req.ip }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    
    await AuditLog.create({
      userId: user._id,
      action: 'login_success',
      metadata: { ip: req.ip, userAgent: req.headers['user-agent'] }
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      token: accessToken,
      accessToken,
      user: {
        id: user._id,
        name: user.profile.fullName,
        email: user.email,
        role: user.role,
        school_code: user.profile.schoolCode
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const verifySession = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: 'Token required' });

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    res.status(200).json({
      user: {
        id: user._id,
        name: user.profile.fullName,
        email: user.email,
        role: user.role,
        school_code: user.profile.schoolCode
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const { accessToken, refreshToken: nextRefreshToken } = generateTokens(user);

    res.cookie('refreshToken', nextRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      token: accessToken,
      accessToken,
      user: {
        id: user._id,
        name: user.profile.fullName,
        email: user.email,
        role: user.role,
        school_code: user.profile.schoolCode
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const requestOTP = async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;
    const user = await User.findOne(email ? { email } : { 'profile.phone': phone });
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = '123456'; // Use 123456 for manual testing locally
    
    await AuditLog.create({
      userId: user._id,
      action: 'otp_requested',
      metadata: { method: email ? 'email' : 'phone', ip: req.ip }
    });

    res.status(200).json({ 
      success: true, 
      message: 'OTP sent successfully (Use 123456)',
      school_code: user.profile?.schoolCode
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { email, phone, otp } = req.body;
    if (otp !== '123456') return res.status(401).json({ error: 'Invalid OTP' });

    const user = await User.findOne(email ? { email } : { 'profile.phone': phone });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { accessToken, refreshToken } = generateTokens(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      token: accessToken,
      accessToken,
      user: {
        id: user._id,
        name: user.profile.fullName,
        email: user.email,
        role: user.role,
        school_code: user.profile.schoolCode
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const logout = async (req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  res.status(200).json({ success: true });
};
