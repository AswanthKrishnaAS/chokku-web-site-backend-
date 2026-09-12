const User = require('../models/User');
const Customer = require('../models/Customer');

const seedDefaultUser = async () => {
  try {
    // 1. Ensure User collection contains Admin and Super Admin users
    await User.deleteMany({ role: { $nin: ['admin', 'superadmin'] }, username: { $nin: ['chokku@store.com', 'superchokku@store'] } });

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
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
      }
      console.log('👑 Admin user chokku@store.com exists in User collection');
    }

    // Seed Super Admin User (superchokku@store / chokku1234)
    const existingSuperAdmin = await User.findOne({
      $or: [{ username: 'superchokku@store' }, { email: 'superchokku@store' }],
    });

    if (!existingSuperAdmin) {
      const superAdminUser = new User({
        name: 'Super Admin',
        username: 'superchokku@store',
        email: 'superchokku@store',
        phone: '+91 9999988888',
        password: 'chokku1234',
        role: 'superadmin',
        gender: 'Male',
      });
      await superAdminUser.save();
      console.log('⚡ Seeded Super Admin user in User collection (superchokku@store / chokku1234)');
    } else {
      if (existingSuperAdmin.role !== 'superadmin') {
        existingSuperAdmin.role = 'superadmin';
        await existingSuperAdmin.save();
      }
      console.log('⚡ Super Admin user superchokku@store exists in User collection');
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
