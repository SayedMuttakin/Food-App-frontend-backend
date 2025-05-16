const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const menuRoutes = require('./routes/menu');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const reservationRoutes = require('./routes/reservations');

// Load environment variables
dotenv.config();

const app = express();

// Basic middleware
app.use(cors());

// Body parsers
// For Stripe webhook - must be before JSON parser and other routes
const stripeWebhookPath = '/api/payment/stripe/webhook';
app.use((req, res, next) => {
  if (req.originalUrl === stripeWebhookPath) {
    // For Stripe webhooks, use raw body parser to get the raw body for signature verification
    bodyParser.raw({ type: 'application/json' })(req, res, next);
  } else if (req.headers['content-type'] === 'application/json') {
    // For JSON requests
    bodyParser.json()(req, res, next);
  } else {
    // For other content types (including url-encoded form data)
    bodyParser.urlencoded({ extended: true })(req, res, next);
  }
});

// Debugging middleware to log all incoming requests
app.use((req, res, next) => {
  const startTime = Date.now();
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Log response
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    
    // If there was an error, log more details
    if (res.statusCode >= 400) {
      console.log(`Response body for error ${res.statusCode}:`, typeof body === 'object' ? JSON.stringify(body) : body);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/food_delivery', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Test connection endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/reservations', reservationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 