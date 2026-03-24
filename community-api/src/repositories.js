const { getDb, withTransaction } = require('./db');
const {
  buildExcerpt,
  buildCursorFromIso,
  createId,
  nowIso,
  parseCursor,
} = require('./helpers');

async function listFeed({ sort = 'recommended', cursor }) {
  const db = await getDb();
  const parsedCursor = parseCursor(cursor);

  let orderBy = 'p.published_at DESC';
  if (sort === 'hot' || sort === 'recommended') {
    orderBy =
      '(p.like_count * 1.0 + p.comment_count * 2.0 + p.favorite_count * 1.5) DESC, p.published_at DESC';
  }

  const [items] = await db.execute(
    `
      SELECT
        p.id,
        p.title,
        p.excerpt,
        p.published_at,
        p.like_count,
        p.comment_count,
        p.favorite_count,
        u.id AS author_id,
        u.external_account_id,
        u.display_name,
        u.handle,
        u.avatar_url
      FROM community_posts p
      JOIN community_users u ON u.id = p.author_id
      WHERE p.deleted_at IS NULL
        AND (? IS NULL OR p.published_at < ?)
      ORDER BY ${orderBy}
      LIMIT 21
    `,
    [parsedCursor, parsedCursor],
  );

  const paged = items.slice(0, 20);
  const imagesByPostId = await listImagesForPosts(
    paged.map(item => item.id),
    db,
  );

  return {
    items: paged.map(item => mapFeedPost(item, imagesByPostId[item.id] || [])),
    nextCursor: items.length > 20 ? buildCursorFromIso(items[19].published_at) : null,
  };
}

async function listImagesForPosts(postIds, executor) {
  if (!postIds.length) {
    return {};
  }

  const db = executor || (await getDb());
  const placeholders = postIds.map(() => '?').join(', ');
  const [rows] = await db.execute(
    `
      SELECT post_id, image_url
      FROM community_post_images
      WHERE post_id IN (${placeholders})
      ORDER BY sort_order ASC
    `,
    postIds,
  );

  return rows.reduce((accumulator, row) => {
    if (!accumulator[row.post_id]) {
      accumulator[row.post_id] = [];
    }

    accumulator[row.post_id].push(row.image_url);
    return accumulator;
  }, {});
}

async function getPostDetail(postId, viewerId) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT
        p.id,
        p.title,
        p.content,
        p.excerpt,
        p.published_at,
        p.author_id,
        p.like_count,
        p.comment_count,
        p.favorite_count,
        u.external_account_id,
        u.display_name,
        u.handle,
        u.avatar_url
      FROM community_posts p
      JOIN community_users u ON u.id = p.author_id
      WHERE p.id = ? AND p.deleted_at IS NULL
      LIMIT 1
    `,
    [postId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const imageUrls = (await listImagesForPosts([postId], db))[postId] || [];

  let liked = false;
  let favorited = false;

  if (viewerId) {
    const [[likedRow]] = await db.execute(
      `
        SELECT 1
        FROM community_post_likes
        WHERE post_id = ? AND user_id = ?
        LIMIT 1
      `,
      [postId, viewerId],
    );
    const [[favoritedRow]] = await db.execute(
      `
        SELECT 1
        FROM community_post_favorites
        WHERE post_id = ? AND user_id = ?
        LIMIT 1
      `,
      [postId, viewerId],
    );
    liked = Boolean(likedRow);
    favorited = Boolean(favoritedRow);
  }

  return {
    author: {
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
      externalAccountId: row.external_account_id,
      handle: row.handle,
      id: row.author_id,
    },
    content: row.content,
    excerpt: row.excerpt,
    id: row.id,
    imagePreviewUrls: imageUrls,
    publishedAt: row.published_at,
    stats: {
      commentCount: row.comment_count,
      favoriteCount: row.favorite_count,
      likeCount: row.like_count,
    },
    title: row.title,
    viewerContext: {
      canDelete: viewerId === row.author_id,
      favorited,
      liked,
    },
  };
}

async function createPost({
  authorId,
  title,
  content,
  imageUrls = [],
  postId = createId('post'),
  publishedAt = nowIso(),
}) {
  await withTransaction(async connection => {
    await connection.execute(
      `
        INSERT INTO community_posts (
          id, author_id, title, content, excerpt, published_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [postId, authorId, title, content, buildExcerpt(content), publishedAt],
    );

    for (const [index, imageUrl] of imageUrls.entries()) {
      await connection.execute(
        `
          INSERT INTO community_post_images (
            id, post_id, image_url, sort_order
          ) VALUES (?, ?, ?, ?)
        `,
        [createId('image'), postId, imageUrl, index],
      );
    }
  });

  return getPostDetail(postId, authorId);
}

async function softDeletePost({ postId, userId }) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT author_id
      FROM community_posts
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [postId],
  );

  if (rows.length === 0) {
    return { status: 'missing' };
  }

  if (rows[0].author_id !== userId) {
    return { status: 'forbidden' };
  }

  await db.execute(
    'UPDATE community_posts SET deleted_at = ? WHERE id = ?',
    [nowIso(), postId],
  );
  return { status: 'deleted' };
}

async function listComments(postId, cursor) {
  const db = await getDb();
  const parsedCursor = parseCursor(cursor);
  const [rows] = await db.execute(
    `
      SELECT
        c.id,
        c.post_id,
        c.content,
        c.published_at,
        c.like_count,
        c.parent_comment_id,
        c.reply_to_user_id,
        author.id AS author_id,
        author.external_account_id AS author_external_account_id,
        author.display_name AS author_display_name,
        author.handle AS author_handle,
        author.avatar_url AS author_avatar_url,
        reply_user.id AS reply_user_id,
        reply_user.external_account_id AS reply_external_account_id,
        reply_user.display_name AS reply_display_name,
        reply_user.handle AS reply_handle,
        reply_user.avatar_url AS reply_avatar_url
      FROM community_comments c
      JOIN community_users author ON author.id = c.author_id
      LEFT JOIN community_users reply_user ON reply_user.id = c.reply_to_user_id
      WHERE c.post_id = ?
        AND c.deleted_at IS NULL
        AND (? IS NULL OR c.published_at < ?)
      ORDER BY c.published_at ASC
      LIMIT 31
    `,
    [postId, parsedCursor, parsedCursor],
  );

  return {
    items: rows.slice(0, 30).map(row => ({
      author: {
        avatarUrl: row.author_avatar_url,
        displayName: row.author_display_name,
        externalAccountId: row.author_external_account_id,
        handle: row.author_handle,
        id: row.author_id,
      },
      content: row.content,
      id: row.id,
      likeCount: row.like_count,
      parentCommentId: row.parent_comment_id,
      postId: row.post_id,
      publishedAt: row.published_at,
      replyToUser: row.reply_user_id
        ? {
            avatarUrl: row.reply_avatar_url,
            displayName: row.reply_display_name,
            externalAccountId: row.reply_external_account_id,
            handle: row.reply_handle,
            id: row.reply_user_id,
          }
        : null,
    })),
    nextCursor: rows.length > 30 ? buildCursorFromIso(rows[29].published_at) : null,
  };
}

async function createComment({
  postId,
  authorId,
  content,
  parentCommentId = null,
  replyToUserId = null,
  commentId = createId('comment'),
  publishedAt = nowIso(),
}) {
  await withTransaction(async connection => {
    await connection.execute(
      `
        INSERT INTO community_comments (
          id, post_id, author_id, parent_comment_id, reply_to_user_id, content, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [commentId, postId, authorId, parentCommentId, replyToUserId, content, publishedAt],
    );

    await connection.execute(
      `
        UPDATE community_posts
        SET comment_count = comment_count + 1
        WHERE id = ?
      `,
      [postId],
    );
  });

  const result = await listComments(postId);
  return result.items[result.items.length - 1];
}

async function softDeleteComment({ commentId, userId }) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT author_id, post_id
      FROM community_comments
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [commentId],
  );

  if (rows.length === 0) {
    return { status: 'missing' };
  }

  if (rows[0].author_id !== userId) {
    return { status: 'forbidden' };
  }

  await withTransaction(async connection => {
    await connection.execute(
      'UPDATE community_comments SET deleted_at = ? WHERE id = ?',
      [nowIso(), commentId],
    );
    await connection.execute(
      `
        UPDATE community_posts
        SET comment_count = GREATEST(comment_count - 1, 0)
        WHERE id = ?
      `,
      [rows[0].post_id],
    );
  });

  return { status: 'deleted' };
}

async function toggleReaction({ entityType, targetId, userId, reactionType, enabled }) {
  const db = await getDb();
  const table =
    entityType === 'post'
      ? reactionType === 'favorite'
        ? 'community_post_favorites'
        : 'community_post_likes'
      : 'community_comment_likes';
  const targetColumn = entityType === 'post' ? 'post_id' : 'comment_id';
  const aggregateTable = entityType === 'post' ? 'community_posts' : 'community_comments';
  const aggregateColumn = reactionType === 'favorite' ? 'favorite_count' : 'like_count';

  await withTransaction(async connection => {
    if (enabled) {
      await connection.execute(
        `
          INSERT IGNORE INTO ${table} (${targetColumn}, user_id, created_at)
          VALUES (?, ?, ?)
        `,
        [targetId, userId, nowIso()],
      );
    } else {
      await connection.execute(
        `DELETE FROM ${table} WHERE ${targetColumn} = ? AND user_id = ?`,
        [targetId, userId],
      );
    }

    await connection.execute(
      `
        UPDATE ${aggregateTable}
        SET ${aggregateColumn} = (
          SELECT COUNT(*)
          FROM ${table}
          WHERE ${targetColumn} = ?
        )
        WHERE id = ?
      `,
      [targetId, targetId],
    );
  });
}

async function getProfileById(profileId) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT
        u.id,
        u.external_account_id,
        u.display_name,
        u.handle,
        u.avatar_url,
        u.bio,
        (
          SELECT COUNT(*)
          FROM community_posts p
          WHERE p.author_id = u.id AND p.deleted_at IS NULL
        ) AS post_count,
        (
          SELECT COUNT(*)
          FROM community_comments c
          WHERE c.author_id = u.id AND c.deleted_at IS NULL
        ) AS comment_count,
        (
          SELECT COUNT(*)
          FROM community_post_favorites f
          WHERE f.user_id = u.id
        ) AS favorite_count
      FROM community_users u
      WHERE u.id = ?
      LIMIT 1
    `,
    [profileId],
  );

  if (rows.length === 0) {
    return null;
  }

  const profile = rows[0];
  return {
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    displayName: profile.display_name,
    externalAccountId: profile.external_account_id,
    handle: profile.handle,
    id: profile.id,
    stats: {
      commentCount: profile.comment_count,
      favoriteCount: profile.favorite_count,
      postCount: profile.post_count,
    },
  };
}

async function getCurrentUserSummary(userId) {
  return getProfileById(userId);
}

async function listMyPosts(userId) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT
        p.id,
        p.title,
        p.excerpt,
        p.published_at,
        p.like_count,
        p.comment_count,
        p.favorite_count,
        u.id AS author_id,
        u.external_account_id,
        u.display_name,
        u.handle,
        u.avatar_url
      FROM community_posts p
      JOIN community_users u ON u.id = p.author_id
      WHERE p.author_id = ? AND p.deleted_at IS NULL
      ORDER BY p.published_at DESC
    `,
    [userId],
  );

  const imagesByPostId = await listImagesForPosts(
    rows.map(row => row.id),
    db,
  );

  return rows.map(row => mapFeedPost(row, imagesByPostId[row.id] || []));
}

async function listMyComments(userId) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT id, post_id, content, published_at, like_count
      FROM community_comments
      WHERE author_id = ? AND deleted_at IS NULL
      ORDER BY published_at DESC
    `,
    [userId],
  );

  return rows.map(row => ({
    content: row.content,
    id: row.id,
    likeCount: row.like_count,
    postId: row.post_id,
    publishedAt: row.published_at,
  }));
}

async function listMyFavorites(userId) {
  const db = await getDb();
  const [rows] = await db.execute(
    `
      SELECT
        p.id,
        p.title,
        p.excerpt,
        p.published_at,
        p.like_count,
        p.comment_count,
        p.favorite_count,
        u.id AS author_id,
        u.external_account_id,
        u.display_name,
        u.handle,
        u.avatar_url
      FROM community_post_favorites f
      JOIN community_posts p ON p.id = f.post_id
      JOIN community_users u ON u.id = p.author_id
      WHERE f.user_id = ? AND p.deleted_at IS NULL
      ORDER BY f.created_at DESC
    `,
    [userId],
  );

  const imagesByPostId = await listImagesForPosts(
    rows.map(row => row.id),
    db,
  );

  return rows.map(row => mapFeedPost(row, imagesByPostId[row.id] || []));
}

async function createUploadRecord({
  fileId,
  userId,
  filename,
  mimeType,
  storagePath,
  publicUrl,
  width,
  height,
}) {
  const db = await getDb();
  await db.execute(
    `
      INSERT INTO community_uploads (
        id, user_id, file_name, mime_type, storage_path, public_url, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [fileId, userId, filename, mimeType, storagePath, publicUrl, width, height, nowIso()],
  );
}

function mapFeedPost(row, imagePreviewUrls) {
  return {
    author: {
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
      externalAccountId: row.external_account_id,
      handle: row.handle,
      id: row.author_id,
    },
    excerpt: row.excerpt,
    id: row.id,
    imagePreviewUrls,
    publishedAt: row.published_at,
    stats: {
      commentCount: row.comment_count,
      favoriteCount: row.favorite_count,
      likeCount: row.like_count,
    },
    title: row.title,
  };
}

module.exports = {
  createComment,
  createPost,
  createUploadRecord,
  getCurrentUserSummary,
  getProfileById,
  getPostDetail,
  listComments,
  listFeed,
  listMyComments,
  listMyFavorites,
  listMyPosts,
  softDeleteComment,
  softDeletePost,
  toggleReaction,
};
