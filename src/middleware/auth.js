const jwt = require('jsonwebtoken');
const db = require('../../config/database');

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const [users] = await db.execute(
      'SELECT id, name, email, role, vacation_days, used_days, must_change_password FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check if password change is required
const checkPasswordChange = (req, res, next) => {
  if (req.user.must_change_password && req.path !== '/api/auth/change-password') {
    return res.status(403).json({ error: 'Password change required', requirePasswordChange: true });
  }
  next();
};

module.exports = { authenticate, requireAdmin, checkPasswordChange };
