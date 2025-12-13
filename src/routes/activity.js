const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getRecentActivity } = require('../services/activityLog');

const router = express.Router();

// Get activity log (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const activities = await getRecentActivity(Math.min(limit, 500));
    
    res.json(activities.map(a => ({
      id: a.id,
      userId: a.user_id,
      userName: a.user_name,
      action: a.action,
      description: a.description,
      targetType: a.target_type,
      targetId: a.target_id,
      createdAt: a.created_at
    })));
  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
