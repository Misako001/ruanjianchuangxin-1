const { getDb } = require('./db');
const { buildExcerpt, buildCursorFromIso, createId, nowIso, parseCursor } = require('./helpers');

function listFeed({ sort = 'recommended', cursor }) {
  const db = getDb();
  const parsedCursor = parseCursor(cursor);

  let orderBy = 'p.published_at DESC';
  if (sort === 'hot' || sort === 'recommended') {
    orderBy =
      '(p.like_count * 1.0 + p.comment_count * 2.0 + p.favorite_count * 1.5) DESC, p.published_at DESC';
  }

  const items = db
    .prepare(
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
        AND (@cursor IS NULL OR p.published_at < @cursor)
      ORDER BY ${orderBy}
      LIMIT 21
    `,
    )
    .all({ cursor: parsedCursor || null });

  const paged = items.slice(0, 20);
  const imagesByPostId = listImagesForPosts(paged.map(item => item.id));

  return {
    items: paged.map(item => mapFeedPost(item, imagesByPostId[item.id] || [])),
    nextCursor: items.length > 20 ? buildCursorFromIso(items[19].published_at) : null,
  };
}

function listImagesForPosts(postIds) {
  if (!postIds.length) {
    return {};
  }

  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT post_id, image_url
      FROM community_post_images
      WHERE post_id IN (${postIds.map(() => '?').join(',')})
      ORDER BY sort_order ASC
    `,
    )
    .all(...postIds);

  return rows.reduce((accumulator, row) => {
    if (!accumulator[row.post_id]) {
      accumulator[row.post_id] = [];
    }
    accumulator[row.post_id].push(row.image_url);
    return accumulator;
  }, {});
}

function getPostDetail(postId, viewerId) {
  const db = getDb();
  const row = db
    .prepare(
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
    `,
    )
    .get(postId);

  if (!row) {
    return null;
  }

  const imageUrls = listImagesForPosts([postId])[postId] || [];
  const liked = viewerId
    ? Boolean(
        db
          .prepare(
            'SELECT 1 FROM community_post_likes WHERE post_id = ? AND user_id = ?',
          )
          .get(postId, viewerId),
      )
    : false;
  const favorited = viewerId
    ? Boolean(
        db
          .prepare(
            'SELECT 1 FROM community_post_favorites WHERE post_id = ? AND user_id = ?',
          )
          .get(postId, viewerId),
      )
    : false;

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    publishedAt: row.published_at,
    author: {
      id: row.author_id,
      externalAccountId: row.external_account_id,
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
    },
    imagePreviewUrls: imageUrls,
    stats: {
      likeCount: row.like_count,
      commentCount: row.comment_count,
      favoriteCount: row.favorite_count,
    },
    viewerContext: {
      liked,
      favorited,
      canDelete: viewerId === row.author_id,
    },
  };
}

function createPost({
  authorId,
  title,
  content,
  imageUrls = [],
  postId = createId('post'),
  publishedAt = nowIso(),
}) {
  const db = getDb();

  const transaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO community_posts (
        id, author_id, title, content, excerpt, published_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(postId, authorId, title, content, buildExcerpt(content), publishedAt);

    imageUrls.forEach((imageUrl, index) => {
      db.prepare(
        `
        INSERT INTO community_post_images (
          id, post_id, image_url, sort_order
        ) VALUES (?, ?, ?, ?)
      `,
      ).run(createId('image'), postId, imageUrl, index);
    });
  });

  transaction();
  return getPostDetail(postId, authorId);
}

function softDeletePost({ postId, userId }) {
  const db = getDb();
  const post = db
    .prepare('SELECT author_id FROM community_posts WHERE id = ? AND deleted_at IS NULL')
    .get(postId);

  if (!post) {
    return { status: 'missing' };
  }

  if (post.author_id !== userId) {
    return { status: 'forbidden' };
  }

  db.prepare('UPDATE community_posts SET deleted_at = ? WHERE id = ?').run(nowIso(), postId);
  return { status: 'deleted' };
}

function listComments(postId, cursor) {
  const db = getDb();
  const parsedCursor = parseCursor(cursor);
  const rows = db
    .prepare(
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
    )
    .all(postId, parsedCursor || null, parsedCursor || null);

  return {
    items: rows.slice(0, 30).map(row => ({
      id: row.id,
      postId: row.post_id,
      content: row.content,
      publishedAt: row.published_at,
      likeCount: row.like_count,
      parentCommentId: row.parent_comment_id,
      author: {
        id: row.author_id,
        externalAccountId: row.author_external_account_id,
        displayName: row.author_display_name,
        handle: row.author_handle,
        avatarUrl: row.author_avatar_url,
      },
      replyToUser: row.reply_user_id
        ? {
            id: row.reply_user_id,
            externalAccountId: row.reply_external_account_id,
            displayName: row.reply_display_name,
            handle: row.reply_handle,
            avatarUrl: row.reply_avatar_url,
          }
        : null,
    })),
    nextCursor: rows.length > 30 ? buildCursorFromIso(rows[29].published_at) : null,
  };
}

function createComment({
  postId,
  authorId,
  content,
  parentCommentId = null,
  replyToUserId = null,
  commentId = createId('comment'),
  publishedAt = nowIso(),
}) {
  const db = getDb();

  db.prepare(
    `
    INSERT INTO community_comments (
      id, post_id, author_id, parent_comment_id, reply_to_user_id, content, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(commentId, postId, authorId, parentCommentId, replyToUserId, content, publishedAt);

  db.prepare(
    'UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = ?',
  ).run(postId);

  return listComments(postId).items.slice(-1)[0];
}

function softDeleteComment({ commentId, userId }) {
  const db = getDb();
  const comment = db
    .prepare(
      'SELECT author_id, post_id FROM community_comments WHERE id = ? AND deleted_at IS NULL',
    )
    .get(commentId);

  if (!comment) {
    return { status: 'missing' };
  }

  if (comment.author_id !== userId) {
    return { status: 'forbidden' };
  }

  db.prepare('UPDATE community_comments SET deleted_at = ? WHERE id = ?').run(
    nowIso(),
    commentId,
  );
  db.prepare(
    'UPDATE community_posts SET comment_count = MAX(comment_count - 1, 0) WHERE id = ?',
  ).run(comment.post_id);

  return { status: 'deleted' };
}

function toggleReaction({ entityType, targetId, userId, reactionType, enabled }) {
  const db = getDb();
  const table =
    entityType === 'post'
      ? reactionType === 'favorite'
        ? 'community_post_favorites'
        : 'community_post_likes'
      : 'community_comment_likes';
  const targetColumn = entityType === 'post' ? 'post_id' : 'comment_id';
  const aggregateTable = entityType === 'post' ? 'community_posts' : 'community_comments';
  const aggregateColumn = reactionType === 'favorite' ? 'favorite_count' : 'like_count';

  if (enabled) {
    db.prepare(
      `INSERT OR IGNORE INTO ${table} (${targetColumn}, user_id, created_at) VALUES (?, ?, ?)`,
    ).run(targetId, userId, nowIso());
  } else {
    db.prepare(`DELETE FROM ${table} WHERE ${targetColumn} = ? AND user_id = ?`).run(
      targetId,
      userId,
    );
  }

  db.prepare(
    `
    UPDATE ${aggregateTable}
    SET ${aggregateColumn} = (
      SELECT COUNT(*)
      FROM ${table}
      WHERE ${targetColumn} = ?
    )
    WHERE id = ?
  `,
  ).run(targetId, targetId);
}

function getProfileById(profileId) {
  const db = getDb();
  const profile = db
    .prepare(
      `
      SELECT
        u.id,
        u.external_account_id,
        u.display_name,
        u.handle,
        u.avatar_url,
        u.bio,
        (
          SELECT COUNT(*) FROM community_posts p
          WHERE p.author_id = u.id AND p.deleted_at IS NULL
        ) AS post_count,
        (
          SELECT COUNT(*) FROM community_comments c
          WHERE c.author_id = u.id AND c.deleted_at IS NULL
        ) AS comment_count,
        (
          SELECT COUNT(*) FROM community_post_favorites f
          WHERE f.user_id = u.id
        ) AS favorite_count
      FROM community_users u
      WHERE u.id = ?
    `,
    )
    .get(profileId);

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    externalAccountId: profile.external_account_id,
    displayName: profile.display_name,
    handle: profile.handle,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    stats: {
      postCount: profile.post_count,
      commentCount: profile.comment_count,
      favoriteCount: profile.favorite_count,
    },
  };
}

function getCurrentUserSummary(userId) {
  return getProfileById(userId);
}

function listMyPosts(userId) {
  const db = getDb();
  const rows = db
    .prepare(
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
    )
    .all(userId);

  const imagesByPostId = listImagesForPosts(rows.map(row => row.id));
  return rows.map(row => mapFeedPost(row, imagesByPostId[row.id] || []));
}

function listMyComments(userId) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT id, post_id, content, published_at, like_count
      FROM community_comments
      WHERE author_id = ? AND deleted_at IS NULL
      ORDER BY published_at DESC
    `,
    )
    .all(userId)
    .map(row => ({
      id: row.id,
      postId: row.post_id,
      content: row.content,
      publishedAt: row.published_at,
      likeCount: row.like_count,
    }));
}

function listMyFavorites(userId) {
  const db = getDb();
  const rows = db
    .prepare(
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
    )
    .all(userId);

  const imagesByPostId = listImagesForPosts(rows.map(row => row.id));
  return rows.map(row => mapFeedPost(row, imagesByPostId[row.id] || []));
}

function mapFeedPost(row, imagePreviewUrls) {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.published_at,
    author: {
      id: row.author_id,
      externalAccountId: row.external_account_id,
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
    },
    imagePreviewUrls,
    stats: {
      likeCount: row.like_count,
      commentCount: row.comment_count,
      favoriteCount: row.favorite_count,
    },
  };
}

module.exports = {
  createComment,
  createPost,
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
