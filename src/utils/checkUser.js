const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');

const checkAndEnsureUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');

    const count = await User.countDocuments();
    console.log(`Total users in DB: ${count}`);

    let demoUser = await User.findOne({ email: 'john.doe@example.com' });
    if (!demoUser) {
      demoUser = new User({
        name: 'John Doe',
        email: 'john.doe@example.com',
        password: 'password123',
        phone: '+1 (555) 000-1234',
        address: '123 Green Avenue',
        city: 'Eco City',
        state: 'California',
        pincode: '90210',
      });
      await demoUser.save();
      console.log('✅ Created john.doe@example.com with password password123');
    } else {
      demoUser.password = 'password123';
      await demoUser.save();
      console.log('✅ Updated john.doe@example.com password to password123');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

checkAndEnsureUser();
