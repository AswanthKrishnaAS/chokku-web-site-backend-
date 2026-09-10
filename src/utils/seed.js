const User = require('../models/User');
const Customer = require('../models/Customer');

const seedDefaultUser = async () => {
  try {
    // 1. Ensure User collection contains ONLY the Admin user
    // Clean up any non-admin users from User collection
    await User.deleteMany({ role: { $ne: 'admin' }, username: { $ne: 'chokku@store.com' } });

    const existingAdmin = await User.findOne({
      $or: [{ username: 'chokku@store.com' }, { email: 'chokku@store.com' }],
    });

    if (!existingAdmin) {
      const adminUser = new User({
        name: 'Chokku Admin',
        username: 'chokku@store.com',
        email: 'chokku@store.com',
        phone: '+91 9999999999',
        password: 'chokku@123',
        role: 'admin',
        gender: 'Male',
      });
      await adminUser.save();
      console.log('👑 Seeded Admin user in User collection (chokku@store.com / chokku@123)');
    } else {
      console.log('👑 Admin user chokku@store.com exists in User collection');
    }

    // 2. Seed Default Demo Customer in Customer collection
    const existingCustomer = await Customer.findOne({
      $or: [{ username: 'johndoe' }, { email: 'john.doe@example.com' }],
    });

    if (!existingCustomer) {
      const defaultCustomer = new Customer({
        name: 'John Doe',
        username: 'johndoe',
        gender: 'Male',
        phone: '+91 9876543210',
        email: 'john.doe@example.com',
        password: 'password123',
        address: '123 Green Avenue',
        city: 'Eco City',
        state: 'California',
        pincode: '90210',
        role: 'customer',
      });

      await defaultCustomer.save();
      console.log('🌱 Seeded default demo customer in Customer collection (johndoe / password123)');
    } else {
      console.log('🌱 Demo customer johndoe exists in Customer collection');
    }
  } catch (error) {
    console.error('Error seeding default accounts:', error.message);
  }
};

module.exports = seedDefaultUser;
