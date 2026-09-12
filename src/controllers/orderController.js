const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

// Helper to auto-sync shipping address to Customer addresses array in MongoDB (max 3 addresses)
const syncCustomerAddressOnOrder = async (customerId, shippingAddress, customerInfo) => {
  try {
    let customer;
    if (customerId) {
      customer = await Customer.findById(customerId);
    }
    if (!customer && shippingAddress?.email) {
      customer = await Customer.findOne({ email: shippingAddress.email.toLowerCase() });
    }
    if (!customer && shippingAddress?.phone) {
      customer = await Customer.findOne({ phone: shippingAddress.phone });
    }

    if (customer && shippingAddress) {
      if (!customer.addresses) customer.addresses = [];

      const exists = customer.addresses.some(
        (a) => a.pincode === shippingAddress.pincode && a.address === shippingAddress.address
      );

      if (!exists && customer.addresses.length < 3) {
        const isFirst = customer.addresses.length === 0;
        customer.addresses.push({
          label: isFirst ? 'Primary Address' : `Address ${customer.addresses.length + 1}`,
          isPrimary: isFirst,
          fullName: shippingAddress.fullName || customer.name,
          email: shippingAddress.email || customer.email || '',
          phone: shippingAddress.phone || customer.phone || '',
          address: shippingAddress.address,
          city: shippingAddress.city,
          state: shippingAddress.state || '',
          pincode: shippingAddress.pincode,
        });
      }

      if (!customer.address) customer.address = shippingAddress.address;
      if (!customer.city) customer.city = shippingAddress.city;
      if (!customer.state) customer.state = shippingAddress.state || '';
      if (!customer.pincode) customer.pincode = shippingAddress.pincode;
      if (!customer.email && shippingAddress.email) customer.email = shippingAddress.email;

      await customer.save();
    }
  } catch (err) {
    console.warn('⚠️ Could not auto-sync customer address to profile:', err.message);
  }
};

// Initialize Razorpay Instance
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_TaRS7minNorlEi';
  const key_secret = process.env.RAZORPAY_KEY_SECRET || 'bArTrGOZDgK68QsUZejXtEh2';
  return new Razorpay({ key_id, key_secret });
};

/**
 * @desc    Create Razorpay Order in Razorpay Server and Pending Order in MongoDB
 * @route   POST /api/orders/create-razorpay-order
 * @access  Public / Customer
 */
const createRazorpayOrder = async (req, res) => {
  try {
    const { items, subtotal, discount, deliveryFee, totalAmount, shippingAddress, customerInfo } = req.body;

    if (!items || !items.length || !totalAmount || !shippingAddress) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order details provided. Items, shipping address, and total amount are required.',
      });
    }

    const orderCustomId = `ORD-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const amountInPaise = Math.round(Number(totalAmount) * 100);

    const razorpay = getRazorpayInstance();

    // 1. Create order on Razorpay servers
    const razorpayOptions = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: orderCustomId,
      notes: {
        customerName: shippingAddress.fullName || customerInfo?.name || '',
        customerEmail: shippingAddress.email || customerInfo?.email || '',
        customerPhone: shippingAddress.phone || customerInfo?.phone || '',
      },
    };

    const razorpayOrder = await razorpay.orders.create(razorpayOptions);

    // 2. Save pending order details in MongoDB
    const customerId = req.customer?._id || req.body.customerId || null;

    const newOrder = new Order({
      orderCustomId,
      customer: customerId,
      customerInfo: customerInfo || {
        name: shippingAddress.fullName,
        email: shippingAddress.email,
        phone: shippingAddress.phone,
      },
      items,
      subtotal: Number(subtotal || totalAmount),
      discount: Number(discount || 0),
      deliveryFee: Number(deliveryFee || 0),
      totalAmount: Number(totalAmount),
      shippingAddress,
      paymentMethod: 'Razorpay (Test)',
      paymentStatus: 'pending',
      status: 'Processing',
      razorpayOrderId: razorpayOrder.id,
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    await newOrder.save();

    // Auto-sync address into Customer collection (max 3 addresses)
    await syncCustomerAddressOnOrder(customerId, shippingAddress, customerInfo);

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_TaRS7minNorlEi';

    res.status(201).json({
      success: true,
      message: 'Razorpay order created successfully',
      dbOrderId: newOrder._id,
      orderCustomId: newOrder.orderCustomId,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId,
    });
  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create Razorpay order',
    });
  }
};

/**
 * @desc    Verify Razorpay Payment Signature and update MongoDB Order to paid
 * @route   POST /api/orders/verify-razorpay-payment
 * @access  Public / Customer
 */
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, dbOrderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing Razorpay verification parameters',
      });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'bArTrGOZDgK68QsUZejXtEh2';

    // Verify signature using HMAC SHA256
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    // Find MongoDB Order
    let order;
    if (dbOrderId) {
      order = await Order.findById(dbOrderId);
    }
    if (!order) {
      order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found in database',
      });
    }

    if (isAuthentic) {
      order.paymentStatus = 'paid';
      order.status = 'Processing';
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;

      const now = new Date();
      const paymentDate = now.toISOString().split('T')[0];
      const paymentTime = now.toTimeString().split(' ')[0];
      order.paymentDate = paymentDate;
      order.paymentTime = paymentTime;

      // Try fetching rich transaction details directly from Razorpay API
      try {
        const razorpay = getRazorpayInstance();
        const razorpayPaymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        if (razorpayPaymentDetails) {
          const methodType = razorpayPaymentDetails.method || 'card';
          let methodLabel = `Razorpay (${methodType.toUpperCase()})`;

          if (methodType === 'upi') {
            const vpa = razorpayPaymentDetails.vpa || '';
            methodLabel = `UPI ${vpa ? `(${vpa})` : ''}`.trim();
          } else if (methodType === 'card') {
            const cardNet = razorpayPaymentDetails.card?.network || 'Card';
            const cardLast4 = razorpayPaymentDetails.card?.last4 || '';
            methodLabel = `Card (${cardNet}${cardLast4 ? ` **** ${cardLast4}` : ''})`;
          } else if (methodType === 'netbanking') {
            const bank = razorpayPaymentDetails.bank || '';
            methodLabel = `Net Banking ${bank ? `(${bank})` : ''}`.trim();
          } else if (methodType === 'wallet') {
            const wallet = razorpayPaymentDetails.wallet || '';
            methodLabel = `Wallet ${wallet ? `(${wallet})` : ''}`.trim();
          }

          order.paymentMethod = methodLabel;
          order.paymentMethodDetails = {
            method: methodType,
            vpa: razorpayPaymentDetails.vpa || '',
            bank: razorpayPaymentDetails.bank || '',
            wallet: razorpayPaymentDetails.wallet || '',
            cardLast4: razorpayPaymentDetails.card?.last4 || '',
            cardNetwork: razorpayPaymentDetails.card?.network || '',
            cardType: razorpayPaymentDetails.card?.type || '',
            amountPaid: (razorpayPaymentDetails.amount || 0) / 100,
            currency: razorpayPaymentDetails.currency || 'INR',
            email: razorpayPaymentDetails.email || order.shippingAddress?.email || '',
            contact: razorpayPaymentDetails.contact || order.shippingAddress?.phone || '',
            rrn: razorpayPaymentDetails.acquirer_data?.rrn || razorpayPaymentDetails.acquirer_data?.upi_transaction_id || '',
            capturedAt: razorpayPaymentDetails.created_at ? new Date(razorpayPaymentDetails.created_at * 1000) : now,
          };

          if (razorpayPaymentDetails.created_at) {
            const payTimeObj = new Date(razorpayPaymentDetails.created_at * 1000);
            order.paymentDate = payTimeObj.toISOString().split('T')[0];
            order.paymentTime = payTimeObj.toTimeString().split(' ')[0];
          }
        }
      } catch (rzpFetchErr) {
        console.warn('⚠️ Could not fetch Razorpay payment details via SDK (Test key or sandbox mode):', rzpFetchErr.message);
        if (!order.paymentMethodDetails) {
          order.paymentMethod = order.paymentMethod || 'Razorpay Online (UPI/Card)';
          order.paymentMethodDetails = {
            method: 'razorpay_online',
            amountPaid: order.totalAmount,
            currency: 'INR',
            email: order.shippingAddress?.email || '',
            contact: order.shippingAddress?.phone || '',
            capturedAt: now,
          };
        }
      }

      await order.save();

      // Real-time notification to admin dashboard via Socket.IO
      const io = req.app.get('io');
      if (io) {
        const orderData = {
          id: order.orderCustomId,
          _id: order._id,
          date: order.createdAt ? order.createdAt.toISOString().split('T')[0] : paymentDate,
          createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
          items: order.items,
          subtotal: order.subtotal,
          discount: order.discount,
          deliveryFee: order.deliveryFee,
          totalAmount: order.totalAmount,
          status: order.status,
          paymentStatus: order.paymentStatus,
          shippingAddress: order.shippingAddress,
          customerInfo: order.customerInfo,
          paymentMethod: order.paymentMethod,
          paymentMethodDetails: order.paymentMethodDetails,
          paymentDate: order.paymentDate,
          paymentTime: order.paymentTime,
          estimatedDelivery: order.estimatedDelivery,
          razorpayOrderId: order.razorpayOrderId,
          razorpayPaymentId: order.razorpayPaymentId,
          razorpaySignature: order.razorpaySignature,
        };
        io.emit('admin_new_order', orderData);
        io.emit('admin_payment_update', orderData);
      }

      return res.status(200).json({
        success: true,
        message: 'Razorpay payment verified successfully',
        order,
      });
    } else {
      order.paymentStatus = 'failed';
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Razorpay verification failed.',
      });
    }
  } catch (error) {
    console.error('❌ Error verifying Razorpay payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment verification failed',
    });
  }
};

/**
 * @desc    Create Cash on Delivery (COD) Order
 * @route   POST /api/orders/create-cod-order
 * @access  Public / Customer
 */
const createCodOrder = async (req, res) => {
  try {
    const { items, subtotal, discount, deliveryFee, totalAmount, shippingAddress, customerInfo } = req.body;

    if (!items || !items.length || !totalAmount || !shippingAddress) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order details provided.',
      });
    }

    const orderCustomId = `ORD-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const customerId = req.customer?._id || req.body.customerId || null;

    const newOrder = new Order({
      orderCustomId,
      customer: customerId,
      customerInfo: customerInfo || {
        name: shippingAddress.fullName,
        email: shippingAddress.email,
        phone: shippingAddress.phone,
      },
      items,
      subtotal: Number(subtotal || totalAmount),
      discount: Number(discount || 0),
      deliveryFee: Number(deliveryFee || 0),
      totalAmount: Number(totalAmount),
      shippingAddress,
      paymentMethod: 'Cash on Delivery (COD)',
      paymentStatus: 'cod',
      status: 'Processing',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    await newOrder.save();

    // Auto-sync address into Customer collection (max 3 addresses)
    await syncCustomerAddressOnOrder(customerId, shippingAddress, customerInfo);

    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      const orderData = {
        id: newOrder.orderCustomId,
        _id: newOrder._id,
        date: newOrder.createdAt.toISOString().split('T')[0],
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        discount: newOrder.discount,
        deliveryFee: newOrder.deliveryFee,
        totalAmount: newOrder.totalAmount,
        status: newOrder.status,
        paymentStatus: newOrder.paymentStatus,
        shippingAddress: newOrder.shippingAddress,
        paymentMethod: newOrder.paymentMethod,
        estimatedDelivery: newOrder.estimatedDelivery,
      };
      io.emit('admin_new_order', orderData);
    }

    res.status(201).json({
      success: true,
      message: 'Cash on Delivery order created successfully',
      order: newOrder,
    });
  } catch (error) {
    console.error('❌ Error creating COD order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create COD order',
    });
  }
};

/**
 * @desc    Get Logged In Customer Orders
 * @route   GET /api/orders/my-orders
 * @access  Private / Customer
 */
const getMyOrders = async (req, res) => {
  try {
    const { email, phone, userId, username } = req.query;
    const filterConditions = [];

    if (req.customer?._id) {
      filterConditions.push({ customer: req.customer._id });
    }
    if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
      filterConditions.push({ customer: userId });
    }
    if (email) {
      const lowerEmail = email.toLowerCase().trim();
      filterConditions.push({ 'shippingAddress.email': lowerEmail });
      filterConditions.push({ 'customerInfo.email': lowerEmail });
    }
    if (phone) {
      const cleanPhone = phone.trim();
      filterConditions.push({ 'shippingAddress.phone': cleanPhone });
      filterConditions.push({ 'customerInfo.phone': cleanPhone });
    }
    if (username) {
      filterConditions.push({ 'customerInfo.username': username.toLowerCase().trim() });
    }

    let filter = {};
    if (filterConditions.length > 0) {
      filter = { $or: filterConditions };
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer orders',
    });
  }
};

/**
 * @desc    Get All Orders for Admin
 * @route   GET /api/orders/admin/all
 * @access  Admin
 */
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    const formattedOrders = orders.map((o) => ({
      id: o.orderCustomId,
      _id: o._id,
      date: o.createdAt ? o.createdAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      createdAt: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString(),
      customerInfo: o.customerInfo || {
        name: o.shippingAddress?.fullName,
        email: o.shippingAddress?.email,
        phone: o.shippingAddress?.phone,
      },
      items: o.items,
      subtotal: o.subtotal,
      discount: o.discount,
      deliveryFee: o.deliveryFee,
      totalAmount: o.totalAmount,
      status: o.status,
      paymentStatus: o.paymentStatus,
      shippingAddress: o.shippingAddress,
      paymentMethod: o.paymentMethod,
      paymentMethodDetails: o.paymentMethodDetails,
      paymentDate: o.paymentDate || (o.createdAt ? o.createdAt.toISOString().split('T')[0] : null),
      paymentTime: o.paymentTime || (o.createdAt ? o.createdAt.toTimeString().split(' ')[0] : null),
      estimatedDelivery: o.estimatedDelivery,
      razorpayOrderId: o.razorpayOrderId,
      razorpayPaymentId: o.razorpayPaymentId,
      razorpaySignature: o.razorpaySignature,
    }));

    res.status(200).json({
      success: true,
      count: orders.length,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error('❌ Error fetching all orders for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin orders',
    });
  }
};

/**
 * @desc    Update Order Status by Admin
 * @route   PUT /api/orders/admin/status/:id
 * @access  Admin
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    let order = await Order.findOne({ $or: [{ _id: id }, { orderCustomId: id }] });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    order.status = status;
    await order.save();

    const io = req.app.get('io');
    if (io) {
      const payload = { orderId: order.orderCustomId, _id: order._id, status };
      io.emit('customer_order_status_update', payload);
      io.emit('admin_order_status_update', payload);
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order,
    });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
    });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  createCodOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
};
