# Food Delivery Application

A full-stack food delivery application built with MERN stack (MongoDB, Express.js, React, Node.js).

## Features

- 🍔 Full menu management system
- 👤 User authentication and authorization
- 🛒 Shopping cart functionality
- 💳 Online payment integration (Stripe)
- 📱 Responsive design
- 🔐 Admin dashboard
- 🪑 Table reservation system
- 📊 Sales and order analytics

## Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB
- JWT Authentication
- Stripe Payment Gateway

### Frontend
- React.js
- Redux for state management
- Tailwind CSS
- Axios for API calls

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/SayedMuttakin/Food-App-frontend-backend.git
cd Food-App-frontend-backend
```

2. Install Backend Dependencies
```bash
cd food-backend
npm install
```

3. Install Frontend Dependencies
```bash
cd ../food-frontend
npm install
```

4. Set up Environment Variables

Create a `.env` file in the backend directory with the following variables:
```
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_uri
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLIC_KEY=your_stripe_public_key
FRONTEND_URL=http://localhost:3000
```

5. Start the Development Servers

Backend:
```bash
cd food-backend
npm run dev
```

Frontend:
```bash
cd food-frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## API Documentation

### Auth Routes
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login user
- GET `/api/auth/profile` - Get user profile

### Menu Routes
- GET `/api/menu` - Get all menu items
- GET `/api/menu/:id` - Get single menu item
- POST `/api/menu` - Add new menu item (Admin only)
- PUT `/api/menu/:id` - Update menu item (Admin only)
- DELETE `/api/menu/:id` - Delete menu item (Admin only)

### Order Routes
- POST `/api/orders` - Create new order
- GET `/api/orders` - Get all orders (Admin only)
- GET `/api/orders/:id` - Get single order
- PUT `/api/orders/:id` - Update order status (Admin only)

### Reservation Routes
- POST `/api/reservations` - Create new reservation
- GET `/api/reservations` - Get all reservations
- PUT `/api/reservations/:id` - Update reservation status

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License. 