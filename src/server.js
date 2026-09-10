const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const websiteSettingsRoutes = require('./routes/websiteSettingsRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const catchGameRoutes = require('./routes/catchGameRoutes');
const http = require('http');
const { Server } = require('socket.io');
const seedDefaultUser = require('./utils/seed');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Real-time socket connection handler
io.on('connection', (socket) => {
  console.log('⚡ Client connected to socket:', socket.id);

  // Relay order notifications to admin
  socket.on('new_order', (order) => {
    console.log('📦 Real-time new order event:', order.id);
    io.emit('admin_new_order', order);
  });

  // Relay customer registration notifications to admin
  socket.on('new_customer', (customer) => {
    console.log('👤 Real-time new customer event:', customer.name || customer.username);
    io.emit('admin_new_customer', customer);
  });

  // Relay order status changes
  socket.on('order_status_update', (data) => {
    console.log('🔄 Real-time order status update:', data);
    io.emit('customer_order_status_update', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected from socket:', socket.id);
  });
});

app.set('io', io);

// Security Headers Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Middleware
app.use(cors());
app.use(express.json());

// Serve static uploads folder for local file fallback
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/website-settings', websiteSettingsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/catch-game', catchGameRoutes);
app.use('/api', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Backend service with WebSocket support is running',
    timestamp: new Date().toISOString(),
  });
});

// JSON Syntax Error Handler Middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload provided',
    });
  }
  next(err);
});

// Start Server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await seedDefaultUser();

  server.listen(PORT, () => {
    console.log(`🚀 WebSocket & Express server running on port ${PORT}`);
    console.log(`🔑 Auth endpoints: http://localhost:${PORT}/api/auth/login & http://localhost:${PORT}/api/auth/register`);
  });
};

startServer();
