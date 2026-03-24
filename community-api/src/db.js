const mysql = require('mysql2/promise');

const { mysql: mysqlConfig } = require('./config');

let poolPromise = null;

async function getDb() {
  if (!poolPromise) {
    poolPromise = createPool();
  }

  return poolPromise;
}

async function withTransaction(callback) {
  const db = await getDb();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function closeDb() {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise;
  await pool.end();
  poolPromise = null;
}

async function resetDb() {
  await closeDb();

  const bootstrapConnection = await mysql.createConnection({
    host: mysqlConfig.host,
    password: mysqlConfig.password,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
  });

  await bootstrapConnection.query(
    `DROP DATABASE IF EXISTS ${escapeIdentifier(mysqlConfig.database)}`,
  );
  await bootstrapConnection.end();
}

async function createPool() {
  const bootstrapConnection = await mysql.createConnection({
    host: mysqlConfig.host,
    password: mysqlConfig.password,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
  });

  await bootstrapConnection.query(
    `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(
      mysqlConfig.database,
    )} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrapConnection.end();

  const pool = mysql.createPool({
    ...mysqlConfig,
    charset: 'utf8mb4',
    database: mysqlConfig.database,
    queueLimit: 0,
    waitForConnections: true,
  });

  await initializeSchema(pool);
  return pool;
}

async function initializeSchema(db) {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS community_users (
        id VARCHAR(64) PRIMARY KEY,
        external_account_id VARCHAR(128) NOT NULL UNIQUE,
        display_name VARCHAR(128) NOT NULL,
        handle VARCHAR(128) NOT NULL UNIQUE,
        avatar_url VARCHAR(1024) NULL,
        bio TEXT NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'member',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at VARCHAR(32) NOT NULL,
        updated_at VARCHAR(32) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_posts (
        id VARCHAR(64) PRIMARY KEY,
        author_id VARCHAR(64) NOT NULL,
        title VARCHAR(120) NOT NULL,
        content TEXT NOT NULL,
        excerpt VARCHAR(255) NOT NULL,
        published_at VARCHAR(32) NOT NULL,
        deleted_at VARCHAR(32) NULL,
        like_count INT UNSIGNED NOT NULL DEFAULT 0,
        comment_count INT UNSIGNED NOT NULL DEFAULT 0,
        favorite_count INT UNSIGNED NOT NULL DEFAULT 0,
        INDEX idx_community_posts_author_id (author_id),
        INDEX idx_community_posts_published_at (published_at),
        CONSTRAINT fk_community_posts_author
          FOREIGN KEY (author_id) REFERENCES community_users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_post_images (
        id VARCHAR(64) PRIMARY KEY,
        post_id VARCHAR(64) NOT NULL,
        image_url VARCHAR(1024) NOT NULL,
        sort_order INT UNSIGNED NOT NULL DEFAULT 0,
        width INT UNSIGNED NOT NULL DEFAULT 1200,
        height INT UNSIGNED NOT NULL DEFAULT 900,
        INDEX idx_community_post_images_post_id (post_id),
        CONSTRAINT fk_community_post_images_post
          FOREIGN KEY (post_id) REFERENCES community_posts(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_comments (
        id VARCHAR(64) PRIMARY KEY,
        post_id VARCHAR(64) NOT NULL,
        author_id VARCHAR(64) NOT NULL,
        parent_comment_id VARCHAR(64) NULL,
        reply_to_user_id VARCHAR(64) NULL,
        content TEXT NOT NULL,
        published_at VARCHAR(32) NOT NULL,
        deleted_at VARCHAR(32) NULL,
        like_count INT UNSIGNED NOT NULL DEFAULT 0,
        INDEX idx_community_comments_post_id (post_id),
        INDEX idx_community_comments_author_id (author_id),
        INDEX idx_community_comments_published_at (published_at),
        CONSTRAINT fk_community_comments_post
          FOREIGN KEY (post_id) REFERENCES community_posts(id),
        CONSTRAINT fk_community_comments_author
          FOREIGN KEY (author_id) REFERENCES community_users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_post_likes (
        post_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        created_at VARCHAR(32) NOT NULL,
        PRIMARY KEY (post_id, user_id),
        CONSTRAINT fk_community_post_likes_post
          FOREIGN KEY (post_id) REFERENCES community_posts(id),
        CONSTRAINT fk_community_post_likes_user
          FOREIGN KEY (user_id) REFERENCES community_users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_comment_likes (
        comment_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        created_at VARCHAR(32) NOT NULL,
        PRIMARY KEY (comment_id, user_id),
        CONSTRAINT fk_community_comment_likes_comment
          FOREIGN KEY (comment_id) REFERENCES community_comments(id),
        CONSTRAINT fk_community_comment_likes_user
          FOREIGN KEY (user_id) REFERENCES community_users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_post_favorites (
        post_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        created_at VARCHAR(32) NOT NULL,
        PRIMARY KEY (post_id, user_id),
        CONSTRAINT fk_community_post_favorites_post
          FOREIGN KEY (post_id) REFERENCES community_posts(id),
        CONSTRAINT fk_community_post_favorites_user
          FOREIGN KEY (user_id) REFERENCES community_users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS community_uploads (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        storage_path VARCHAR(1024) NOT NULL,
        public_url VARCHAR(1024) NOT NULL,
        width INT UNSIGNED NOT NULL DEFAULT 1200,
        height INT UNSIGNED NOT NULL DEFAULT 900,
        created_at VARCHAR(32) NOT NULL,
        INDEX idx_community_uploads_user_id (user_id),
        CONSTRAINT fk_community_uploads_user
          FOREIGN KEY (user_id) REFERENCES community_users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
  ];

  for (const statement of statements) {
    await db.query(statement);
  }
}

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

module.exports = {
  closeDb,
  getDb,
  resetDb,
  withTransaction,
};
