const db = require('../../config/database');

const ACTIONS = {
  // Vacation actions
  VACATION_SUBMITTED: 'vacation_submitted',
  VACATION_CANCELLED: 'vacation_cancelled',
  
  // User actions
  USER_CREATED: 'user_created',
  USER_DELETED: 'user_deleted',
  USER_ROLE_CHANGED: 'user_role_changed',
  PASSWORD_CHANGED: 'password_changed',
  
  // Blackout actions
  BLACKOUT_CREATED: 'blackout_created',
  BLACKOUT_DELETED: 'blackout_deleted',
  
  // Auth actions
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout'
};

async function log(userId, userName, action, description, targetType = null, targetId = null) {
  try {
    await db.execute(
      'INSERT INTO activity_log (user_id, user_name, action, description, target_type, target_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, description, targetType, targetId]
    );
  } catch (error) {
    console.error('Failed to log activity:', error.message);
  }
}

async function getRecentActivity(limit = 100) {
  const [rows] = await db.execute(
    `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports = {
  ACTIONS,
  log,
  getRecentActivity
};
