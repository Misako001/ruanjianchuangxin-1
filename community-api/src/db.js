const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { databasePath } = require('./config');

let db;

function getDb() {
  if (!db) {
    if (databasePath !== ':memory:') {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }

    db = new Database(databasePath);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }

  return db;
}

function initializeSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS community_users (
      id TEXT PRIMARY KEY,
      external_account_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      avatar_url TEXT,
      bio TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      published_at TEXT NOT NULL,
      deleted_at TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      favorite_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (author_id) REFERENCES community_users(id)
    );

    CREATE TABLE IF NOT EXISTS community_post_images (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 1200,
      height INTEGER NOT NULL DEFAULT 900,
      FOREIGN KEY (post_id) REFERENCES community_posts(id)
    );

    CREATE TABLE IF NOT EXISTS community_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      parent_comment_id TEXT,
      reply_to_user_id TEXT,
      content TEXT NOT NULL,
      published_at TEXT NOT NULL,
      deleted_at TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES community_posts(id),
      FOREIGN KEY (author_id) REFERENCES community_users(id)
    );

    CREATE TABLE IF NOT EXISTS community_post_likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_comment_likes (
      comment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_post_favorites (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS community_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 1200,
      height INTEGER NOT NULL DEFAULT 900,
      created_at TEXT NOT NULL
    );
  `);
}

function resetDb() {
  if (db) {
    db.close();
    db = null;
  }

  if (databasePath !== ':memory:' && fs.existsSync(databasePath)) {
    fs.rmSync(databasePath, { force: true });
  }
}

module.exports = {
  getDb,
  resetDb,
};
