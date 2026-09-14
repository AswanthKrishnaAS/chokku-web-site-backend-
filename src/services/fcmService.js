const AdminFcmToken = require('../models/AdminFcmToken');
const { initializeFirebase, getAdmin } = require('../config/firebase');

/**
 * Send real-time FCM push notification when a new customer registers on Chokku Store website.
 * Retrieves active device tokens from AdminFcmToken DB and dispatches notification via Firebase Admin SDK.
 *
 * @param {string} customerName
 * @param {object} customerData
 */
async function sendNewCustomerPushNotification(customerName, customerData = {}) {
  const name = customerName || customerData.name || customerData.username || customerData.email || 'New Customer';
  const customerId = String(customerData._id || customerData.id || '');
  const customerPhone = String(customerData.phone || '');

  // 1. Query active Admin FCM device tokens from database
  console.log('[FCM] Searching for active admin device tokens...');
  let activeTokenDocs = [];
  try {
    activeTokenDocs = await AdminFcmToken.find({ active: true }).lean();
  } catch (dbErr) {
    console.error('[FCM] Error querying AdminFcmToken DB:', dbErr.message);
  }

  const tokenList = activeTokenDocs.map((doc) => doc.token).filter((t) => t && t.trim());
  console.log(`[FCM] Active tokens found: ${tokenList.length}`);

  if (tokenList.length === 0) {
    console.warn(`[FCM] Notification skipped for "${name}": No active device tokens found in database.`);
    return { success: false, reason: 'No active device tokens found' };
  }

  // Construct standardized FCM Notification payload
  const title = 'New Customer Signup';
  const body = `A new customer, ${name}, has registered.`;
  const channelId = 'chokku_customer_channel_v5';
  const soundName = 'customer'; // Maps to res/raw/customer.mp3 in Android

  const dataPayload = {
    type: 'new_customer',
    customerId: customerId,
    customerName: String(name),
    phone: customerPhone,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  };

  // 2. Dispatch via Firebase Admin SDK
  const firebaseApp = initializeFirebase();
  if (!firebaseApp) {
    console.error('[FCM] Firebase Admin SDK is not initialized. Cannot send notification.');
    return { success: false, reason: 'Firebase Admin SDK not initialized' };
  }

  console.log('[FCM] Sending notification via Firebase Admin SDK...');

  const multicastMessage = {
    tokens: tokenList,
    notification: { title, body },
    data: dataPayload,
    android: {
      priority: 'high',
      notification: {
        title,
        body,
        sound: soundName,
        channelId: channelId,
        icon: '@mipmap/ic_launcher',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        defaultSound: false,
        notificationPriority: 'PRIORITY_MAX',
        visibility: 'PUBLIC',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: 'customer.mp3',
          badge: 1,
          'content-available': 1,
        },
      },
    },
  };

  try {
    const response = await getAdmin().messaging().sendEachForMulticast(multicastMessage);

    // Deactivate unregistered or invalid tokens
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code || resp.error?.message || '';
          const failedToken = tokenList[idx];
          if (
            errCode.includes('registration-token-not-registered') ||
            errCode.includes('invalid-registration-token') ||
            errCode.includes('UNREGISTERED')
          ) {
            console.log(`[FCM] Deactivating invalid FCM token in database`);
            AdminFcmToken.updateOne({ token: failedToken }, { active: false }).catch(() => {});
          }
        }
      });
    }

    if (response.successCount > 0) {
      console.log('[FCM] Notification sent successfully');
      return { success: true };
    } else {
      console.warn(`[FCM] Direct token delivery failed for device(s).`);
      return { success: false, reason: 'Multicast delivery failed' };
    }
  } catch (sdkErr) {
    console.error('[FCM] Notification failed via Firebase Admin SDK:', sdkErr.message);
    return { success: false, error: sdkErr.message };
  }
}

/**
 * Send real-time FCM push notification when a new customer places an order.
 *
 * @param {object} orderData
 */
async function sendNewOrderPushNotification(orderData = {}) {
  const orderCustomId = String(orderData.orderCustomId || orderData.id || orderData._id || 'ORD-NEW');
  const dbOrderId = String(orderData._id || orderData.id || '');
  const shippingAddress = orderData.shippingAddress || {};
  const customerInfo = orderData.customerInfo || {};
  const customerName = String(shippingAddress.fullName || customerInfo.name || 'Customer');
  const customerPhone = String(shippingAddress.phone || customerInfo.phone || 'Not provided');
  const totalAmount = String(orderData.totalAmount || 0);

  console.log(`[FCM] New order notification process started for order: ${orderCustomId}`);

  // 1. Query active Admin FCM device tokens
  console.log('[FCM] Searching for active admin device tokens...');
  let activeTokenDocs = [];
  try {
    activeTokenDocs = await AdminFcmToken.find({ active: true }).lean();
  } catch (dbErr) {
    console.error('[FCM] Error querying AdminFcmToken DB:', dbErr.message);
  }

  const tokenList = activeTokenDocs.map((doc) => doc.token).filter((t) => t && t.trim());
  console.log(`[FCM] Active tokens found: ${tokenList.length}`);

  if (tokenList.length === 0) {
    console.warn(`[FCM] Notification skipped for order "${orderCustomId}": No active device tokens found in database.`);
    return { success: false, reason: 'No active device tokens found' };
  }

  activeTokenDocs.forEach((doc) => {
    console.log(`[FCM] Targeting Admin/Device: ${doc.adminUsername || doc.deviceId || 'flutter_admin_device'} (Platform: ${doc.platform || 'android'})`);
  });

  const title = 'New Customer Order';
  const body = `Order ID: ${orderCustomId} | Phone: ${customerPhone}`;
  const channelId = 'chokku_order_channel_v5';
  const soundName = 'customer';

  const dataPayload = {
    type: 'new_order',
    orderId: orderCustomId,
    dbOrderId: dbOrderId,
    phone: customerPhone,
    customerName: customerName,
    totalAmount: totalAmount,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  };

  const firebaseApp = initializeFirebase();
  if (!firebaseApp) {
    console.error('[FCM] Firebase Admin SDK is not initialized. Cannot send order notification.');
    return { success: false, reason: 'Firebase Admin SDK not initialized' };
  }

  console.log(`[FCM] Sending notification for order: ${orderCustomId}`);

  const multicastMessage = {
    tokens: tokenList,
    notification: { title, body },
    data: dataPayload,
    android: {
      priority: 'high',
      notification: {
        title,
        body,
        sound: soundName,
        channelId: channelId,
        icon: '@mipmap/ic_launcher',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        defaultSound: false,
        notificationPriority: 'PRIORITY_MAX',
        visibility: 'PUBLIC',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: 'customer.mp3',
          badge: 1,
          'content-available': 1,
        },
      },
    },
  };

  try {
    const response = await getAdmin().messaging().sendEachForMulticast(multicastMessage);

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code || resp.error?.message || '';
          const failedToken = tokenList[idx];
          if (
            errCode.includes('registration-token-not-registered') ||
            errCode.includes('invalid-registration-token') ||
            errCode.includes('UNREGISTERED')
          ) {
            console.log(`[FCM] Deactivating invalid FCM token in database: ${failedToken.substring(0, 15)}...`);
            AdminFcmToken.updateOne({ token: failedToken }, { active: false }).catch(() => {});
          }
        }
      });
    }

    if (response.successCount > 0) {
      console.log('[FCM] Notification sent successfully');
      return { success: true };
    } else {
      console.warn('[FCM] Direct token delivery failed for order device(s).');
      return { success: false, reason: 'Multicast delivery failed' };
    }
  } catch (sdkErr) {
    console.error('[FCM] Notification failed via Firebase Admin SDK:', sdkErr.message);
    return { success: false, error: sdkErr.message };
  }
}

module.exports = {
  sendNewCustomerPushNotification,
  sendNewOrderPushNotification,
};
