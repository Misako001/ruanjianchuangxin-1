const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

module.exports = {
  port: Number(process.env.COMMUNITY_API_PORT || 4010),
  databasePath:
    process.env.COMMUNITY_API_DB_PATH ||
    path.join(dataDir, 'community.sqlite'),
  uploadsDir:
    process.env.COMMUNITY_API_UPLOADS_DIR || path.join(dataDir, 'uploads'),
  devAuthToken:
    process.env.COMMUNITY_API_DEV_TOKEN || 'visiongenie-community-dev-token',
};
