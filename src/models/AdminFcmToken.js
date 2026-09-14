const mongoose = require('mongoose');

const adminFcmTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: [true, 'FCM device token is required'],
      unique: true,
      trim: true,
    },
    deviceId: {
      type: String,
      default: 'flutter_admin_device',
      trim: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
    },
    adminUsername: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper static method to register or refresh token in database
adminFcmTokenSchema.statics.registerOrUpdateToken = async function ({ token, deviceId, platform, adminUsername }) {
  if (!token || !token.trim()) return null;

  const cleanToken = token.trim();
  const cleanDeviceId = deviceId ? deviceId.trim() : 'flutter_admin_device';
  const cleanUser = adminUsername ? adminUsername.trim() : '';

  const updateData = {
    token: cleanToken,
    deviceId: cleanDeviceId,
    platform: platform || 'android',
    active: true,
    updatedAt: new Date(),
  };

  if (cleanUser) {
    updateData.adminUsername = cleanUser;
  }

  // Find existing token record by token or deviceId
  let fcmDoc = await this.findOne({
    $or: [{ token: cleanToken }, { deviceId: cleanDeviceId }]
  });

  if (fcmDoc) {
    fcmDoc.token = cleanToken;
    fcmDoc.deviceId = cleanDeviceId;
    fcmDoc.platform = platform || 'android';
    fcmDoc.active = true;
    if (cleanUser) fcmDoc.adminUsername = cleanUser;
    await fcmDoc.save();
    return fcmDoc;
  }

  fcmDoc = await this.create(updateData);
  return fcmDoc;
};

const AdminFcmToken = mongoose.model('AdminFcmToken', adminFcmTokenSchema);

module.exports = AdminFcmToken;
