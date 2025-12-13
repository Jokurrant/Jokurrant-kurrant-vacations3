const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { log, ACTIONS } = require('../services/activityLog');
const { sendWelcomeEmail } = require('../services/email');

const router = express.Router();

// Generate random password
const generateTempPassword = () => {
  return crypto.randomBytes(5).toString('hex'); // 10 characters
};

// Get all users
router.get('/', authenticate, async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, name, email, role, created_at FROM users ORDER BY name'
    );
    
    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.created_at
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, role = 'member' } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    // Check if email exists
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Generate temp password
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create user (no vacation_days field needed)
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES (?, ?, ?, ?, TRUE)',
      [name, email.toLowerCase(), hashedPassword, role]
    );

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.USER_CREATED,
      `Created user ${name} (${email}) with role ${role}`,
      'user',
      result.insertId
    );

    // Send welcome email with credentials
    const loginUrl = `${req.protocol}://${req.get('host')}`;
    sendWelcomeEmail(email.toLowerCase(), name, tempPassword, loginUrl)
      .catch(err => console.error('Welcome email error:', err));

    res.status(201).json({
      user: {
        id: result.insertId,
        name,
        email: email.toLowerCase(),
        role
      },
      tempPassword // Send this to admin to share with user
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user role (admin only)
router.patch('/:id/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent self-demotion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Get user name for logging
    const [users] = await db.execute('SELECT name FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.USER_ROLE_CHANGED,
      `Changed ${users[0].name}'s role to ${role}`,
      'user',
      id
    );

    res.json({ message: 'Role updated' });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user for logging
    const [users] = await db.execute('SELECT name, email FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (cascade will delete their vacation requests)
    await db.execute('DELETE FROM users WHERE id = ?', [id]);

    // Log activity
    await log(
      req.user.id,
      req.user.name,
      ACTIONS.USER_DELETED,
      `Deleted user ${users[0].name} (${users[0].email})`,
      'user',
      id
    );

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
