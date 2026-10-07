// Automatic seeding disabled per user request.
// Only actual users who register through the website will be created in the database.
const seedDefaultUser = async () => {
  // No-op: No dummy users, customers, or admins are auto-seeded.
};

module.exports = seedDefaultUser;
