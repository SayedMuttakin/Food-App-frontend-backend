const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded.userId) {
        return res.status(401).json({ message: 'Invalid token structure' });
      }

      // Convert string ID to MongoDB ObjectId
      const userId = new mongoose.Types.ObjectId(decoded.userId);

      // Add user from payload
      req.user = {
        ...decoded,
        userId: userId
      };
      
      next();
    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError);
      return res.status(401).json({ message: 'Token is not valid', error: jwtError.message });
    }
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ message: 'Server error in auth middleware', error: error.message });
  }
}; 