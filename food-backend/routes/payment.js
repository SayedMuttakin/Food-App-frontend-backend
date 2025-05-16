const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const { v4: uuidv4 } = require('uuid');
const paymentConfig = require('../config/payment');
const stripeConfig = require('../config/stripe');
const stripe = require('stripe')(stripeConfig.secretKey);

// SSLCommerz configuration
const sslConfig = paymentConfig.sslcommerz;

/**
 * @route   POST api/payment/stripe/create-session
 * @desc    Create a Stripe checkout session
 * @access  Private
 */
router.post('/stripe/create-session', auth, async (req, res) => {
  try {
    console.log('Stripe create-session request received:', {
      body: req.body,
      user: req.user
    });
    
    const { orderId, amount, customerInfo } = req.body;
    
    if (!orderId || !amount) {
      console.log('Missing required parameters:', { orderId, amount });
      return res.status(400).json({ message: 'Order ID and amount are required' });
    }
    
    console.log('Looking for order with ID:', orderId);
    
    // Get order from database to verify amount and status
    const order = await Order.findById(orderId);
    
    if (!order) {
      console.log('Order not found with ID:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }
    
    console.log('Order found:', {
      id: order._id,
      total: order.total,
      paymentStatus: order.paymentStatus,
      itemsCount: order.items.length
    });
    
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Order is already paid for' });
    }
    
    // Create a transactionId for reference
    const transactionId = uuidv4();
    
    // Update order with transaction info
    order.paymentMethod = 'stripe';
    order.transactionId = transactionId;
    await order.save();
    
    console.log('Creating line items for Stripe');
    
    try {
      // Verify we have items to process
      if (!order.items || order.items.length === 0) {
        console.error('Order has no items', order);
        return res.status(400).json({ message: 'Order has no items to process' });
      }
      
      // Create line items for Stripe
      const lineItems = order.items.map(item => {
        // Log each item for debugging
        console.log('Processing item:', item);
        
        if (!item.name || typeof item.price !== 'number') {
          console.error('Invalid item data:', item);
          throw new Error(`Invalid item data: ${JSON.stringify(item)}`);
        }
        
        return {
          price_data: {
            currency: stripeConfig.currency,
            product_data: {
              name: item.name || 'Food item',
              images: item.image ? [item.image] : [],
            },
            unit_amount: Math.round((item.price || 0) * 100), // Stripe expects amount in cents
          },
          quantity: item.quantity || 1,
        };
      });
      
      console.log('Line items created:', lineItems);
      
      // Add delivery fee if applicable
      if (order.deliveryFee) {
        lineItems.push({
          price_data: {
            currency: stripeConfig.currency,
            product_data: {
              name: 'Delivery Fee',
            },
            unit_amount: Math.round(order.deliveryFee * 100),
          },
          quantity: 1,
        });
      }
      
      console.log('Creating Stripe checkout session with config:', {
        success_url: `${stripeConfig.successUrl}?orderId=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${stripeConfig.cancelUrl}?orderId=${order._id}`,
        customer_email: customerInfo?.email,
        items_count: lineItems.length
      });
      
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${stripeConfig.successUrl}?orderId=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${stripeConfig.cancelUrl}?orderId=${order._id}`,
        customer_email: customerInfo?.email || 'customer@example.com',
        client_reference_id: order._id.toString(),
        metadata: {
          orderId: order._id.toString(),
          transactionId
        }
      });
      
      console.log('Stripe session created successfully:', {
        sessionId: session.id,
        url: session.url
      });
      
      return res.json({
        success: true,
        sessionId: session.id,
        url: session.url
      });
    } catch (stripeError) {
      console.error('Stripe API error:', {
        message: stripeError.message,
        type: stripeError.type,
        code: stripeError.code,
        param: stripeError.param,
        stack: stripeError.stack
      });
      
      return res.status(500).json({
        message: 'Stripe payment processing error',
        error: stripeError.message,
        code: stripeError.code || 'unknown'
      });
    }
  } catch (error) {
    console.error('Stripe payment initialization error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
});

/**
 * @route   POST api/payment/stripe/webhook
 * @desc    Handle Stripe webhook events
 * @access  Public
 */
router.post('/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    // Log webhook request
    console.log('Received Stripe webhook:', { 
      headers: req.headers['stripe-signature'] ? 'Present' : 'Missing',
      bodyType: typeof req.body, 
      bodyIsBuffer: Buffer.isBuffer(req.body),
      bodyLength: req.body ? (Buffer.isBuffer(req.body) ? req.body.length : JSON.stringify(req.body).length) : 0
    });
    
    // For raw body parser middleware, req.body should be a Buffer
    if (!Buffer.isBuffer(req.body)) {
      console.error('Webhook request body is not a Buffer - middleware issue');
      return res.status(400).send('Webhook Error: Invalid payload format');
    }
    
    // Verify the webhook signature
    try {
      event = stripe.webhooks.constructEvent(
        req.body, // Should already be a Buffer from the middleware
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_key'
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log('Webhook verified successfully, event type:', event.type);
    
    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Extract orderId from metadata
      const orderId = session.metadata.orderId;
      
      if (orderId) {
        try {
          // Find the order
          const order = await Order.findById(orderId);
          
          if (order) {
            // Update order payment status
            order.paymentStatus = 'completed';
            await order.save();
            console.log(`Order ${orderId} payment completed`);
          } else {
            console.log(`Order ${orderId} not found`);
          }
        } catch (error) {
          console.error('Error updating order status:', error);
        }
      } else {
        console.log('No orderId found in session metadata');
      }
    }
    
    res.status(200).json({received: true});
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Webhook processing error');
  }
});

/**
 * @route   POST api/payment/stripe/verify
 * @desc    Verify a Stripe payment
 * @access  Private
 */
router.post('/stripe/verify', auth, async (req, res) => {
  try {
    const { sessionId, orderId } = req.body;
    
    if (!sessionId || !orderId) {
      return res.status(400).json({ message: 'Session ID and Order ID are required' });
    }
    
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Check if the payment was successful
    if (session.payment_status === 'paid') {
      // Find the order
      const order = await Order.findById(orderId);
      
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Update order payment status if not already completed
      if (order.paymentStatus !== 'completed') {
        order.paymentStatus = 'completed';
        await order.save();
      }
      
      return res.json({
        success: true,
        order
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed',
        status: session.payment_status
      });
    }
  } catch (error) {
    console.error('Stripe payment verification error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST api/payment/initiate
 * @desc    Initiate a payment with SSLCommerz
 * @access  Private
 */
router.post('/initiate', auth, async (req, res) => {
  try {
    const { orderId, amount, customerInfo } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ message: 'Order ID and amount are required' });
    }
    
    // Get order from database to verify amount and status
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Order is already paid for' });
    }
    
    const transactionId = uuidv4();
    
    // Prepare data for SSLCommerz
    const sslData = {
      store_id: sslConfig.store_id,
      store_passwd: sslConfig.store_passwd,
      total_amount: amount,
      currency: 'BDT',
      tran_id: transactionId,
      success_url: `${req.protocol}://${req.get('host')}/api/payment/success`,
      fail_url: `${req.protocol}://${req.get('host')}/api/payment/fail`,
      cancel_url: `${req.protocol}://${req.get('host')}/api/payment/cancel`,
      ipn_url: `${req.protocol}://${req.get('host')}/api/payment/ipn`,
      shipping_method: 'NO',
      product_name: 'Food Order',
      product_category: 'Food',
      product_profile: 'general',
      cus_name: customerInfo.name || order.deliveryAddress.name,
      cus_email: customerInfo.email || 'customer@example.com',
      cus_add1: customerInfo.address || order.deliveryAddress.street,
      cus_city: customerInfo.city || order.deliveryAddress.city,
      cus_state: customerInfo.state || order.deliveryAddress.state,
      cus_postcode: customerInfo.zipCode || order.deliveryAddress.zipCode,
      cus_country: 'Bangladesh',
      cus_phone: customerInfo.phone || '01700000000',
      value_a: orderId, // Using value_a to store orderId for verification
    };
    
    // For test mode, we need to use the SSLCommerz Sandbox URL
    const apiUrl = sslConfig.is_live 
      ? 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'
      : 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';
    
    // Send request to SSLCommerz to create a payment session
    const response = await axios.post(apiUrl, sslData);
    
    if (response.data.status === 'SUCCESS') {
      // Update order with transaction info
      order.paymentMethod = 'sslcommerz';
      order.transactionId = transactionId;
      await order.save();
      
      // Return the redirect URL to client
      return res.json({
        success: true,
        redirectUrl: response.data.GatewayPageURL,
        transactionId
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Failed to initialize payment',
        details: response.data
      });
    }
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST api/payment/verify
 * @desc    Verify a payment with SSLCommerz
 * @access  Private
 */
router.post('/verify', auth, async (req, res) => {
  try {
    const { transactionId } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ message: 'Transaction ID is required' });
    }
    
    // Make a validation request to SSLCommerz
    const validationUrl = sslConfig.is_live
      ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
      : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';
    
    const validationData = {
      val_id: transactionId,
      store_id: sslConfig.store_id,
      store_passwd: sslConfig.store_passwd,
      format: 'json'
    };
    
    const response = await axios.get(validationUrl, { params: validationData });
    
    if (response.data.status === 'VALID' || response.data.status === 'VALIDATED') {
      // Find the order by transaction ID
      const order = await Order.findOne({ transactionId });
      
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Update order payment status
      order.paymentStatus = 'completed';
      await order.save();
      
      return res.json({
        success: true,
        order
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Payment validation failed',
        details: response.data
      });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST api/payment/success
 * @desc    Handle payment success callback from SSLCommerz
 * @access  Public
 */
router.post('/success', async (req, res) => {
  try {
    const { val_id, tran_id, value_a } = req.body;
    
    // Find order by ID stored in value_a
    const order = await Order.findById(value_a);
    
    if (!order) {
      return res.status(404).send('Order not found');
    }
    
    // Update order payment status
    order.paymentStatus = 'completed';
    order.transactionId = tran_id;
    await order.save();
    
    // Redirect to order confirmation page
    res.redirect(`${paymentConfig.frontend_url}/payment-success?orderId=${order._id}`);
  } catch (error) {
    console.error('Payment success callback error:', error);
    res.status(500).send('Error processing payment');
  }
});

/**
 * @route   POST api/payment/fail
 * @desc    Handle payment failure callback from SSLCommerz
 * @access  Public
 */
router.post('/fail', async (req, res) => {
  try {
    const { value_a } = req.body;
    
    // Find order by ID stored in value_a
    const order = await Order.findById(value_a);
    
    if (order) {
      // Update order payment status
      order.paymentStatus = 'failed';
      await order.save();
    }
    
    // Redirect to payment failed page
    res.redirect(`${paymentConfig.frontend_url}/payment-failed`);
  } catch (error) {
    console.error('Payment failure callback error:', error);
    res.status(500).send('Error processing payment failure');
  }
});

/**
 * @route   POST api/payment/cancel
 * @desc    Handle payment cancellation callback from SSLCommerz
 * @access  Public
 */
router.post('/cancel', async (req, res) => {
  // Redirect to checkout page
  res.redirect(`${paymentConfig.frontend_url}/checkout`);
});

/**
 * @route   POST api/payment/ipn
 * @desc    Handle Instant Payment Notification from SSLCommerz
 * @access  Public
 */
router.post('/ipn', async (req, res) => {
  try {
    const { status, value_a, tran_id } = req.body;
    
    if (status === 'VALID') {
      const order = await Order.findById(value_a);
      
      if (order) {
        order.paymentStatus = 'completed';
        order.transactionId = tran_id;
        await order.save();
      }
    }
    
    res.status(200).end();
  } catch (error) {
    console.error('IPN handler error:', error);
    res.status(500).end();
  }
});

module.exports = router; 