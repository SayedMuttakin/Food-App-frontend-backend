const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  details: {
    type: String,
    required: true,
    trim: true
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
    required: true
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isAvailable: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  nutritionInfo: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
    fiber: Number
  },
  preparationTime: {
    type: Number, // in minutes
    default: 30
  },
  spicyLevel: {
    type: String,
    enum: ['mild', 'medium', 'hot', 'extra-hot'],
    default: 'medium'
  },
  allergens: [{
    type: String,
    enum: ['dairy', 'nuts', 'eggs', 'soy', 'wheat', 'fish', 'shellfish']
  }],
  isVegetarian: {
    type: Boolean,
    default: false
  },
  discount: {
    percentage: {
      type: Number,
      min: 0,
      max: 100
    },
    validUntil: Date
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Calculate average rating when reviews are modified
menuSchema.pre('save', function(next) {
  if (this.reviews.length > 0) {
    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating = totalRating / this.reviews.length;
  }
  next();
});

// Virtual for discounted price
menuSchema.virtual('discountedPrice').get(function() {
  if (this.discount && this.discount.percentage && this.discount.validUntil > Date.now()) {
    return this.price * (1 - this.discount.percentage / 100);
  }
  return this.price;
});

// Ensure virtuals are included in JSON
menuSchema.set('toJSON', { virtuals: true });
menuSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Menu', menuSchema); 