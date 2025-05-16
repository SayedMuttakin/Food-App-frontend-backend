const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth');

// Create new order
router.post('/', auth, async (req, res) => {
  try {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Auth user:', req.user);

    const { items, total, deliveryAddress, paymentMethod } = req.body;
    
    // Detailed logging
    console.log('Items check:', !!items, Array.isArray(items), items?.length);
    console.log('Total check:', typeof total, total);
    console.log('DeliveryAddress check:', deliveryAddress);
    console.log('PaymentMethod check:', paymentMethod);
    console.log('User check:', !!req.user, !!req.user?.userId);

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required and cannot be empty' });
    }

    if (typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ message: 'Valid total amount is required' });
    }

    if (!deliveryAddress || !deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.state || !deliveryAddress.zipCode) {
      return res.status(400).json({ message: 'Complete delivery address is required' });
    }

    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'User ID is required' });
    }

    // Log the data we're about to save
    console.log('Attempting to create order with:', {
      user: req.user.userId,
      items: items,
      total: total,
      deliveryAddress: deliveryAddress,
      paymentMethod: paymentMethod
    });

    // Create the order document
    const order = new Order({
      user: req.user.userId.toString(),
      items: items.map(item => ({
        menuItem: item.menuItem,
        quantity: item.quantity,
        price: item.price,
        name: item.name,
        image: item.image
      })),
      total,
      deliveryAddress,
      paymentMethod,
      status: 'pending'
    });

    // Try to validate the order before saving
    const validationError = order.validateSync();
    if (validationError) {
      console.error('Validation error details:', JSON.stringify(validationError, null, 2));
      return res.status(400).json({ 
        message: 'Order validation failed', 
        errors: validationError.errors 
      });
    }

    // Save the order
    const savedOrder = await order.save();
    console.log('Order saved successfully:', savedOrder);
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error('Order creation error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      message: 'Error creating order', 
      error: error.message,
      details: error.toString(),
      name: error.name
    });
  }
});

// Get all orders (admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const orders = await Order.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
});

// Get user's orders
router.get('/my-orders', auth, async (req, res) => {
  try {
    console.log('Fetching orders for user:', req.user.userId);
    const orders = await Order.find({ user: req.user.userId })
      .populate('items.menuItem')
      .sort({ createdAt: -1 });
    console.log('Found orders:', orders);
    res.json(orders);
  } catch (error) {
    console.error('Error in /my-orders:', error);
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
});

// Get order stats (admin only)
router.get('/stats', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const totalOrders = await Order.countDocuments({ status: { $ne: 'cancelled' } });
    const totalRevenue = await Order.aggregate([
      {
        $match: { status: { $ne: 'cancelled' } }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ]);

    res.json({
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
});

// Weekly sales stats (last 7 days)
router.get('/weekly-sales', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 6);
    
    try {
      const sales = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(lastWeek.setHours(0,0,0,0)), $lte: new Date(today.setHours(23,59,59,999)) },
            status: { $ne: 'cancelled' }
          }
        },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" }, // 1 for Sunday, 2 for Monday, etc.
            total: { $sum: "$total" }
          }
        },
        { $sort: { '_id': 1 } }
      ]);
    
      // Create a complete week with all days
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekData = [0, 0, 0, 0, 0, 0, 0]; // Initialize with zeros for all days
      
      // Map the sales data to days
      sales.forEach(item => {
        if (item._id >= 1 && item._id <= 7) {
          weekData[item._id - 1] = item.total; // Adjust index (1-based to 0-based)
        }
      });
      
      const result = daysOfWeek.map((day, index) => ({
        name: day,
        sales: weekData[index]
      }));
      
      // Reorder the array to start with Monday
      const mondayIndex = daysOfWeek.indexOf('Mon');
      const reorderedResult = [
        ...result.slice(mondayIndex),
        ...result.slice(0, mondayIndex)
      ];
      
      res.json(reorderedResult);
    } catch (aggregateError) {
      console.error('Aggregate error:', aggregateError);
      
      // Fallback data if aggregation fails
      const fallbackData = [
        { name: 'Mon', sales: 0 },
        { name: 'Tue', sales: 0 },
        { name: 'Wed', sales: 0 },
        { name: 'Thu', sales: 0 },
        { name: 'Fri', sales: 0 },
        { name: 'Sat', sales: 0 },
        { name: 'Sun', sales: 0 }
      ];
      res.json(fallbackData);
    }
  } catch (error) {
    console.error('Error fetching weekly sales:', error);
    // Return fallback data
    const fallbackData = [
      { name: 'Mon', sales: 0 },
      { name: 'Tue', sales: 0 },
      { name: 'Wed', sales: 0 },
      { name: 'Thu', sales: 0 },
      { name: 'Fri', sales: 0 },
      { name: 'Sat', sales: 0 },
      { name: 'Sun', sales: 0 }
    ];
    res.json(fallbackData);
  }
});

// Get single order
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.menuItem');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is admin or order owner
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching order', error: error.message });
  }
});

// Update order status (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = status;
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error updating order status', error: error.message });
  }
});

// Cancel order
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is admin or order owner
    if (!req.user.isAdmin && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only allow cancellation if order is pending
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Cannot cancel order in current status' });
    }

    order.status = 'cancelled';
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling order', error: error.message });
  }
});

// Delete order (only cancelled orders can be deleted)
router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is admin or order owner
    if (!req.user.isAdmin && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only allow deletion if order is cancelled
    if (order.status !== 'cancelled') {
      return res.status(400).json({ message: 'Only cancelled orders can be deleted' });
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting order', error: error.message });
  }
});

module.exports = router; 