const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Register route
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, phone, address } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = new User({
      fullName,
      email,
      password,
      phone,
      address
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token with isAdmin flag
    const token = jwt.sign(
      { 
        userId: user._id,
        isAdmin: user.role === 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        isAdmin: user.role === 'admin'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { fullName, phone, address } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;
    if (address) user.address = address;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
});

// Logout route
router.post('/logout', auth, async (req, res) => {
  try {
    // In a real application, you might want to invalidate the token
    // For now, we'll just send a success message
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error logging out', error: error.message });
  }
});

// Get user stats (count)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.json({ totalUsers });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user stats', error: error.message });
  }
});

// Make user admin (super admin only)
router.post('/make-admin', auth, async (req, res) => {
  try {
    // Check if the requesting user is a super admin
    const requestingUser = await User.findById(req.user.userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only existing admins can create new admins' });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user role to admin
    user.role = 'admin';
    await user.save();

    res.json({ 
      message: 'User has been made admin successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error making user admin', error: error.message });
  }
});

// Create first admin (one-time setup)
router.post('/create-first-admin', async (req, res) => {
  try {
    // Check if any admin exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin already exists. Use make-admin route instead.' });
    }

    const { fullName, email, password, phone, address } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !phone || !address) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create admin user
    const admin = new User({
      fullName,
      email,
      password,
      phone,
      address,
      role: 'admin'
    });

    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: admin._id,
        isAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'First admin created successfully',
      token,
      user: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        isAdmin: true
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating first admin', error: error.message });
  }
});

// Verify admin status
router.get('/verify', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      isAdmin: user.role === 'admin',
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying user', error: error.message });
  }
});

module.exports = router; 