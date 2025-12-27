const express = require('express');
const db = require('../../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { log, ACTIONS } = require('../services/activityLog');

const router = express.Router();

// Format date to YYYY-MM-DD string (fixes timezone issues)
const formatDate = (date) => {
  if (!date) return null;
  if (typeof date === 'string') return date.split('T')[0];
  const d = new Date(date);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// Get all blackout dates
router.get('/', authenticate, async (req, res) => {
  try {
    const [blackouts] = await db.execute(
      `SELECT b.*, u.name as created_by_name 
       FROM blackout_dates b 
       LEFT JOIN users u ON b.created_by = u.id 
       ORDER BY b.start_date DESC`
    );
    
    res.json(blackouts.map(b => ({
      id: b.id,
      startDate: formatDate(b.start_date),
      endDate: formatDate(b.end_date),
      reason: b.reason,
      createdBy: b.created_by_name || 'System',
      createdAt: b.created_at
    })));
  } catch (error) {
    console.error('Get blackouts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create blackout period (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end date required' });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    const [result] = await db.execute(
      'INSERT INTO blackout_dates (start_date, end_date, reason, created_by) VALUES (?, ?, ?, ?)',
      [startDate, endDate, reason || '', req.user.id]
    );

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.BLACKOUT_CREATED,
      `Created blackout period from ${startDate} to ${endDate} - ${reason || 'No reason specified'}`,
      'blackout',
      result.insertId
    );

    res.status(201).json({
      id: result.insertId,
      startDate,
      endDate,
      reason,
      createdBy: req.user.name,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Create blackout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete blackout period (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [blackouts] = await db.execute('SELECT * FROM blackout_dates WHERE id = ?', [id]);
    if (blackouts.length === 0) {
      return res.status(404).json({ error: 'Blackout period not found' });
    }

    const blackout = blackouts[0];

    await db.execute('DELETE FROM blackout_dates WHERE id = ?', [id]);

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.BLACKOUT_DELETED,
      `Deleted blackout period from ${blackout.start_date} to ${blackout.end_date}`,
      'blackout',
      id
    );

    res.json({ message: 'Blackout period deleted' });
  } catch (error) {
    console.error('Delete blackout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
