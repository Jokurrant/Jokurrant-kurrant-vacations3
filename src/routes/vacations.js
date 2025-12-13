const express = require('express');
const db = require('../../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { notifyVacationSubmitted, notifyVacationCancelled, notifyVacationAdminCancelled } = require('../services/email');
const { log, ACTIONS } = require('../services/activityLog');

const router = express.Router();

// Calculate business days between two dates
const getBusinessDays = (start, end) => {
  let count = 0;
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

// Check if dates overlap with blackout
const checkBlackoutOverlap = async (startDate, endDate) => {
  const [blackouts] = await db.execute(
    `SELECT id FROM blackout_dates 
     WHERE (start_date <= ? AND end_date >= ?) 
        OR (start_date <= ? AND end_date >= ?)
        OR (start_date >= ? AND end_date <= ?)`,
    [endDate, startDate, startDate, startDate, startDate, endDate]
  );
  return blackouts.length > 0;
};

// Get all vacation requests
router.get('/', authenticate, async (req, res) => {
  try {
    const [requests] = await db.execute(
      `SELECT v.*, u.name as user_name 
       FROM vacation_requests v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.status != 'cancelled'
       ORDER BY v.start_date DESC`
    );
    
    res.json(requests.map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      startDate: r.start_date,
      endDate: r.end_date,
      reason: r.reason,
      days: r.days,
      status: r.status,
      createdAt: r.created_at
    })));
  } catch (error) {
    console.error('Get vacations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get yearly stats (admin only)
router.get('/stats/yearly', authenticate, requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const [stats] = await db.execute(
      `SELECT 
        u.id as userId,
        u.name as userName,
        u.email,
        COALESCE(SUM(v.days), 0) as totalDays,
        COUNT(v.id) as totalRequests
       FROM users u
       LEFT JOIN vacation_requests v ON u.id = v.user_id 
         AND v.status != 'cancelled'
         AND YEAR(v.start_date) = ?
       GROUP BY u.id, u.name, u.email
       ORDER BY totalDays DESC`,
      [year]
    );
    
    res.json({
      year,
      stats: stats.map(s => ({
        userId: s.userId,
        userName: s.userName,
        email: s.email,
        totalDays: parseInt(s.totalDays),
        totalRequests: parseInt(s.totalRequests)
      }))
    });
  } catch (error) {
    console.error('Get yearly stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my vacation requests
router.get('/my', authenticate, async (req, res) => {
  try {
    const [requests] = await db.execute(
      `SELECT * FROM vacation_requests 
       WHERE user_id = ? AND status != 'cancelled'
       ORDER BY start_date DESC`,
      [req.user.id]
    );
    
    res.json(requests.map(r => ({
      id: r.id,
      userId: r.user_id,
      startDate: r.start_date,
      endDate: r.end_date,
      reason: r.reason,
      days: r.days,
      status: r.status,
      createdAt: r.created_at
    })));
  } catch (error) {
    console.error('Get my vacations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create vacation request (no limits!)
router.post('/', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end date required' });
    }

    // Check for blackout overlap
    const hasOverlap = await checkBlackoutOverlap(startDate, endDate);
    if (hasOverlap) {
      return res.status(400).json({ error: 'Dates overlap with blackout period' });
    }

    // Calculate business days
    const days = getBusinessDays(startDate, endDate);

    // Create request (no limit check!)
    const [result] = await db.execute(
      'INSERT INTO vacation_requests (user_id, start_date, end_date, reason, days, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, startDate, endDate, reason || '', days, 'approved']
    );

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.VACATION_SUBMITTED,
      `Requested vacation from ${startDate} to ${endDate} (${days} days) - ${reason || 'No reason specified'}`,
      'vacation',
      result.insertId
    );

    // Send email notification to admins only
    notifyVacationSubmitted(db, req.user.name, startDate, endDate, days, reason)
      .catch(err => console.error('Email notification error:', err));

    res.status(201).json({
      id: result.insertId,
      userId: req.user.id,
      userName: req.user.name,
      startDate,
      endDate,
      reason,
      days,
      status: 'approved',
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Create vacation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel vacation request
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the request with user name
    const [requests] = await db.execute(
      `SELECT v.*, u.name as user_name 
       FROM vacation_requests v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.id = ?`,
      [id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requests[0];

    // Check permission (own request or admin)
    if (request.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Update status to cancelled
    await db.execute(
      'UPDATE vacation_requests SET status = ? WHERE id = ?',
      ['cancelled', id]
    );

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.VACATION_CANCELLED,
      `Cancelled vacation for ${request.user_name} from ${request.start_date} to ${request.end_date} (${request.days} days)`,
      'vacation',
      id
    );

    // Send email notification to admins only
    notifyVacationCancelled(db, request.user_name, req.user.name, request.start_date, request.end_date, request.days, request.reason)
      .catch(err => console.error('Email notification error:', err));

    res.json({ message: 'Vacation cancelled' });
  } catch (error) {
    console.error('Cancel vacation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin cancel vacation request with reason (sends email to user)
router.post('/:id/admin-cancel', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    // Get the request with user info
    const [requests] = await db.execute(
      `SELECT v.*, u.name as user_name, u.email as user_email 
       FROM vacation_requests v 
       JOIN users u ON v.user_id = u.id 
       WHERE v.id = ?`,
      [id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requests[0];

    // Update status to cancelled
    await db.execute(
      'UPDATE vacation_requests SET status = ? WHERE id = ?',
      ['cancelled', id]
    );

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      'vacation_admin_cancelled',
      `Admin cancelled vacation for ${request.user_name} from ${request.start_date} to ${request.end_date} (${request.days} days). Reason: ${reason}`,
      'vacation',
      id
    );

    // Send email notification to the user
    notifyVacationAdminCancelled(
      request.user_email,
      request.user_name,
      req.user.name,
      request.start_date,
      request.end_date,
      request.days,
      reason
    ).catch(err => console.error('Email notification error:', err));

    res.json({ message: 'Vacation cancelled and user notified' });
  } catch (error) {
    console.error('Admin cancel vacation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
