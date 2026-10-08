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
const tryOnRoutes = require('./routes/tryOnRoutes');
const catchGameRoutes = require('./routes/catchGameRoutes');
const orderRoutes = require('./routes/orderRoutes');
const homepageSliderRoutes = require('./routes/homepageSliderRoutes');
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

  // Relay customer registration notifications to admin and mobile app listeners
  socket.on('new_customer', (customer) => {
    console.log('👤 Real-time new customer event:', customer.name || customer.username);
    io.emit('admin_new_customer', customer);
    io.emit('new_customer', customer);
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

// Attach io instance to every express request
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'Accept', 'Origin'],
  credentials: true,
}));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static uploads folder for local file fallback
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes with /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/notifications', authRoutes);
app.use('/api/website-settings', websiteSettingsRoutes);
app.use('/api/homepage-sliders', homepageSliderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/try-on', tryOnRoutes);
app.use('/api/catch-game', catchGameRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', authRoutes);

// Non-/api route aliases to guarantee requests without /api prefix work cleanly
app.use('/auth', authRoutes);
app.use('/notifications', authRoutes);
app.use('/website-settings', websiteSettingsRoutes);
app.use('/homepage-sliders', homepageSliderRoutes);
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/try-on', tryOnRoutes);
app.use('/catch-game', catchGameRoutes);
app.use('/orders', orderRoutes);

// Health check endpoint (both /api/health and /health)
app.get(['/api/health', '/health'], (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Backend service with WebSocket support is running',
    timestamp: new Date().toISOString(),
  });
});

// JSON Syntax & Body Parser Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      message: 'Payload too large. Image size exceeds allowed server limit.',
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload provided',
    });
  }
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// JSON 404 handler for all unknown endpoints
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found on live API server.`,
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await seedDefaultUser();
  } catch (err) {
    console.error('Database connection / seed warning on startup:', err.message);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WebSocket & Express server running on port ${PORT} (0.0.0.0)`);
    console.log(`🔑 Auth endpoints: http://localhost:${PORT}/api/auth/login & http://10.0.2.2:${PORT}/api/auth/register`);
  });
};

startServer();

