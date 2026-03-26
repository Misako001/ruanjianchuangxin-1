const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dataDir = path.join(__dirname, '..', 'data');

module.exports = {
  devAuthToken:
    process.env.COMMUNITY_API_DEV_TOKEN || 'visiongenie-community-dev-token',
  host: process.env.COMMUNITY_API_HOST || '0.0.0.0',
  mysql: {
    connectionLimit: Number(process.env.COMMUNITY_MYSQL_CONNECTION_LIMIT || 10),
    database: process.env.COMMUNITY_MYSQL_DATABASE || 'visiongenie_community',
    host: process.env.COMMUNITY_MYSQL_HOST || '127.0.0.1',
    password: process.env.COMMUNITY_MYSQL_PASSWORD || 'visiongenie123',
    port: Number(process.env.COMMUNITY_MYSQL_PORT || 3306),
    user: process.env.COMMUNITY_MYSQL_USER || 'visiongenie',
  },
  port: Number(process.env.COMMUNITY_API_PORT || 4010),
  uploadsDir:
    process.env.COMMUNITY_API_UPLOADS_DIR || path.join(dataDir, 'uploads'),
};
