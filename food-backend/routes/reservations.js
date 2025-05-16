const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const auth = require('../middleware/auth');

// Create a new reservation
router.post('/', auth, async (req, res) => {
  try {
    const { name, email, phone, date, time, guests, specialRequests, occasion } = req.body;

    // Check if there are already too many reservations for this time slot
    const existingReservations = await Reservation.countDocuments({
      date: new Date(date),
      time: time,
      status: { $ne: 'cancelled' }
    });

    if (existingReservations >= 5) { // Assuming 5 tables per time slot
      return res.status(400).json({ message: 'No tables available for this time slot' });
    }

    const reservation = new Reservation({
      user: req.user.userId,
      name,
      email,
      phone,
      date,
      time,
      guests,
      specialRequests,
      occasion,
      tableNumber: existingReservations + 1
    });

    await reservation.save();
    res.status(201).json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Error creating reservation', error: error.message });
  }
});

// Get user's reservations
router.get('/my-reservations', auth, async (req, res) => {
  try {
    const reservations = await Reservation.find({ user: req.user.userId })
      .sort({ date: 1, time: 1 });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reservations', error: error.message });
  }
});

// Check availability for a specific date and time
router.get('/check-availability', async (req, res) => {
  try {
    const { date, time } = req.query;
    const existingReservations = await Reservation.countDocuments({
      date: new Date(date),
      time: time,
      status: { $ne: 'cancelled' }
    });

    const available = existingReservations < 5; // Assuming 5 tables per time slot
    const remainingTables = 5 - existingReservations;

    res.json({ 
      available, 
      remainingTables,
      message: available ? 
        `${remainingTables} tables available!` : 
        'No tables available for this time slot'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error checking availability', error: error.message });
  }
});

// Cancel reservation
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (reservation.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({ message: 'Reservation is already cancelled' });
    }

    // Check if cancellation is within 6 hours of reservation
    const reservationTime = new Date(reservation.date);
    const now = new Date();
    const hoursDifference = (reservationTime - now) / (1000 * 60 * 60);

    if (hoursDifference < 6) {
      return res.status(400).json({ message: 'Cannot cancel reservation less than 6 hours before scheduled time' });
    }

    reservation.status = 'cancelled';
    await reservation.save();

    res.json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling reservation', error: error.message });
  }
});

// Admin routes
// Get all reservations (admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const reservations = await Reservation.find()
      .sort({ date: 1, time: 1 });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reservations', error: error.message });
  }
});

// Update reservation status (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { status, tableNumber } = req.body;
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (status) reservation.status = status;
    if (tableNumber) reservation.tableNumber = tableNumber;

    await reservation.save();
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Error updating reservation', error: error.message });
  }
});

module.exports = router; 