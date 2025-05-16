const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');
const auth = require('../middleware/auth');

// Demo data for testing
const demoMenuItems = [
  {
    _id: "m001",
    name: "Cheese Burger",
    description: "Delicious burger with cheese",
    details: "Our classic burger with melted cheese, fresh lettuce, tomatoes, and special sauce",
    price: 8.99,
    category: "burger",
    image: "/images/burger1.png",
    isAvailable: true,
    rating: 4.5,
    preparationTime: 15,
    isVegetarian: false
  },
  {
    _id: "m002",
    name: "Pepperoni Pizza",
    description: "Classic pepperoni pizza",
    details: "Hand-tossed pizza crust topped with tomato sauce, mozzarella cheese, and pepperoni slices",
    price: 12.99,
    category: "pizza",
    image: "/images/pizza1.png",
    isAvailable: true,
    rating: 4.7,
    preparationTime: 20,
    isVegetarian: false
  },
  {
    _id: "m003",
    name: "Chicken Pasta",
    description: "Creamy chicken pasta",
    details: "Fettuccine pasta with creamy alfredo sauce and grilled chicken breast",
    price: 10.99,
    category: "pasta",
    image: "/images/pasta.jpg",
    isAvailable: true,
    rating: 4.3,
    preparationTime: 18,
    isVegetarian: false
  },
  {
    _id: "m004",
    name: "Tomato Soup",
    description: "Homemade tomato soup",
    details: "Creamy tomato soup made with fresh tomatoes, herbs, and a touch of cream",
    price: 5.99,
    category: "soup",
    image: "/images/soup.png",
    isAvailable: true,
    rating: 4.2,
    preparationTime: 12,
    isVegetarian: true
  },
  {
    _id: "m005",
    name: "Grilled Chicken",
    description: "Perfectly grilled chicken",
    details: "Tender grilled chicken breast seasoned with herbs and served with vegetables",
    price: 14.99,
    category: "chicken",
    image: "/images/chicken.png",
    isAvailable: true,
    rating: 4.6,
    preparationTime: 25,
    isVegetarian: false
  },
  {
    _id: "m006",
    name: "Vanilla Ice Cream",
    description: "Classic vanilla ice cream",
    details: "Creamy vanilla ice cream topped with chocolate sauce",
    price: 4.99,
    category: "icecream",
    image: "/images/icecream.jpg",
    isAvailable: true,
    rating: 4.1,
    preparationTime: 5,
    isVegetarian: true
  }
];

// Define these routes BEFORE any other routes to avoid conflicts
// Get menu stats for admin dashboard - NO auth check
router.get('/stats', (req, res) => {
  // Always return demo data for simplicity
  res.json({ totalMenuItems: demoMenuItems.length });
});

// Get category distribution for admin dashboard - NO auth check
router.get('/category-stats', (req, res) => {
  // Generate stats from demo data
  const demoCategories = demoMenuItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = 0;
    acc[item.category]++;
    return acc;
  }, {});
  
  const result = Object.keys(demoCategories).map(category => ({
    name: category.charAt(0).toUpperCase() + category.slice(1),
    value: demoCategories[category]
  }));
  
  res.json(result);
});

// Get menu items with filtering, sorting and pagination
router.get('/', async (req, res) => {
  try {
    const {
      category,
      search,
      sort = 'name',
      order = 'asc',
      page = 1,
      limit = 12,
      priceRange,
      availability
    } = req.query;

    // Try to get real data first
    let items = [];
    
    try {
      // Build filter object
      const filter = {};
      
      if (category && category !== 'all') {
        filter.category = category;
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      if (priceRange) {
        const [min, max] = priceRange.split('-');
        filter.price = { $gte: Number(min), $lte: Number(max) };
      }

      if (availability) {
        filter.isAvailable = availability === 'true';
      }

      // Calculate skip for pagination
      const skip = (Number(page) - 1) * Number(limit);

      // Build sort object
      const sortObj = {};
      sortObj[sort] = order === 'asc' ? 1 : -1;

      // Get menu items
      items = await Menu.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit));

    } catch (err) {
      console.log("Error fetching from database, using demo data:", err.message);
    }

    // If no items from database, use demo data
    if (items.length === 0) {
      console.log("No items in database, using demo data");
      
      // Filter demo data based on request
      let filteredDemoItems = [...demoMenuItems];
      
      if (category && category !== 'all') {
        filteredDemoItems = filteredDemoItems.filter(item => item.category === category);
      }
      
      if (search) {
        const searchLower = search.toLowerCase();
        filteredDemoItems = filteredDemoItems.filter(item => 
          item.name.toLowerCase().includes(searchLower) || 
          item.description.toLowerCase().includes(searchLower)
        );
      }
      
      // Sort demo data
      filteredDemoItems.sort((a, b) => {
        if (sort === 'name') {
          return order === 'asc' 
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        } else if (sort === 'price') {
          return order === 'asc' ? a.price - b.price : b.price - a.price;
        } else if (sort === 'rating') {
          return order === 'asc' ? a.rating - b.rating : b.rating - a.rating;
        }
        return 0;
      });
      
      items = filteredDemoItems;
    }

    // For admin requests, return full array directly
    // Check if this is an admin request (has authorization header)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Return the full array for admin
      return res.json(items);
    }
    
    // For regular user requests, return the array directly too
    res.json(items);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ message: 'Error fetching menu items' });
  }
});

// Get featured menu items
router.get('/featured', async (req, res) => {
  try {
    // Try to get real featured items
    let featuredItems = await Menu.find({ isFeatured: true })
      .limit(6)
      .sort('-rating');
    
    // If no items, use demo data
    if (featuredItems.length === 0) {
      featuredItems = demoMenuItems.slice(0, 3);
    }
    
    res.json(featuredItems);
  } catch (error) {
    // Return demo data on error
    console.log("Error fetching featured items, using demo data");
    res.json(demoMenuItems.slice(0, 3));
  }
});

// Search endpoint for menu items
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Try to get real data first
    let searchResults = [];
    
    try {
      // Search in database
      searchResults = await Menu.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ]
      }).limit(10);
    } catch (err) {
      console.log("Error searching in database, using demo data:", err.message);
    }

    // If no results from database, search in demo data
    if (searchResults.length === 0) {
      console.log("No search results in database, searching in demo data");
      
      const searchLower = query.toLowerCase();
      searchResults = demoMenuItems.filter(item => 
        item.name.toLowerCase().includes(searchLower) || 
        item.description.toLowerCase().includes(searchLower)
      );
    }
    
    res.json(searchResults);
  } catch (error) {
    console.error('Error searching menu items:', error);
    res.status(500).json({ message: 'Error searching menu items' });
  }
});

// Get menu item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Menu.findById(req.params.id);
    
    // If no item found, check demo data
    if (!item) {
      const demoItem = demoMenuItems.find(item => item._id === req.params.id);
      if (demoItem) {
        return res.json(demoItem);
      }
      return res.status(404).json({ message: 'Menu item not found' });
    }
    
    res.json(item);
  } catch (error) {
    // Check if the ID exists in demo data
    const demoItem = demoMenuItems.find(item => item._id === req.params.id);
    if (demoItem) {
      return res.json(demoItem);
    }
    res.status(500).json({ message: 'Error fetching menu item' });
  }
});

// Add new menu item (Admin only)
router.post('/', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const newItem = new Menu(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ message: 'Error creating menu item' });
  }
});

// Update menu item (Admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updatedItem = await Menu.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ message: 'Error updating menu item' });
  }
});

// Delete menu item (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const deletedItem = await Menu.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting menu item' });
  }
});

// Get menu items for admin (simple array format)
router.get('/admin', auth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let items = await Menu.find();
    
    // If no items from database, use demo data
    if (items.length === 0) {
      console.log("No items in database, using demo data for admin");
      items = demoMenuItems;
    }
    
    // Return a simple array for admin panel
    res.json(items);
  } catch (error) {
    console.error('Error fetching menu items for admin:', error);
    res.status(500).json({ message: 'Error fetching menu items' });
  }
});

module.exports = router; 