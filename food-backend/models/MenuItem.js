const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  details: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['pasta', 'burger', 'soup', 'chicken', 'pizza', 'icecream', 'kebab']
  },
  image: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Check if it's a valid URL or base64 image
        return v.startsWith('http') || v.startsWith('data:image') || v.startsWith('/images/');
      },
      message: props => `${props.value} is not a valid image URL or base64 data!`
    }
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MenuItem', menuItemSchema); 