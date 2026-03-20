const express = require('express');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const { uploadsDir } = require('./config');
const { attachOptionalViewer, requireViewer } = require('./auth');
const {
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
} = require('./repositories');
const { createId, nowIso } = require('./helpers');
const { getDb } = require('./db');
const { seed } = require('./seed');

seed();

const app = express();

app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(attachOptionalViewer);

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/community/feed', (request, response) => {
  const sort = request.query.sort || 'recommended';
  const result = listFeed({ sort, cursor: request.query.cursor });
  response.json({
    items: result.items,
    nextCursor: result.nextCursor,
    sort,
  });
});

app.get('/community/posts/:postId', (request, response) => {
  const post = getPostDetail(request.params.postId, request.viewer?.id);
  if (!post) {
    response.status(404).json({ message: 'Post not found.' });
    return;
  }

  response.json(post);
});

app.post('/community/posts', requireViewer, (request, response) => {
  const schema = z.object({
    title: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(5000),
    imageUrls: z.array(z.string().url()).max(9).default([]),
  });
  const payload = schema.safeParse(request.body);

  if (!payload.success) {
    response.status(400).json({ message: payload.error.flatten() });
    return;
  }

  const post = createPost({
    authorId: request.viewer.id,
    title: payload.data.title,
    content: payload.data.content,
    imageUrls: payload.data.imageUrls,
  });

  response.status(201).json(post);
});

app.delete('/community/posts/:postId', requireViewer, (request, response) => {
  const result = softDeletePost({
    postId: request.params.postId,
    userId: request.viewer.id,
  });

  if (result.status === 'missing') {
    response.status(404).json({ message: 'Post not found.' });
    return;
  }

  if (result.status === 'forbidden') {
    response.status(403).json({ message: 'Only the author can delete this post.' });
    return;
  }

  response.status(204).send();
});

app.get('/community/posts/:postId/comments', (request, response) => {
  response.json(listComments(request.params.postId, request.query.cursor));
});

app.post('/community/posts/:postId/comments', requireViewer, (request, response) => {
  const schema = z.object({
    content: z.string().trim().min(1).max(1000),
    parentCommentId: z.string().optional(),
    replyToUserId: z.string().optional(),
  });
  const payload = schema.safeParse(request.body);

  if (!payload.success) {
    response.status(400).json({ message: payload.error.flatten() });
    return;
  }

  const comment = createComment({
    postId: request.params.postId,
    authorId: request.viewer.id,
    content: payload.data.content,
    parentCommentId: payload.data.parentCommentId || null,
    replyToUserId: payload.data.replyToUserId || null,
  });

  response.status(201).json(comment);
});

app.delete('/community/comments/:commentId', requireViewer, (request, response) => {
  const result = softDeleteComment({
    commentId: request.params.commentId,
    userId: request.viewer.id,
  });

  if (result.status === 'missing') {
    response.status(404).json({ message: 'Comment not found.' });
    return;
  }

  if (result.status === 'forbidden') {
    response.status(403).json({
      message: 'Only the comment author can delete this comment.',
    });
    return;
  }

  response.status(204).send();
});

app.post('/community/posts/:postId/like', requireViewer, (request, response) => {
  toggleReaction({
    entityType: 'post',
    targetId: request.params.postId,
    userId: request.viewer.id,
    reactionType: 'like',
    enabled: true,
  });
  response.status(204).send();
});

app.delete('/community/posts/:postId/like', requireViewer, (request, response) => {
  toggleReaction({
    entityType: 'post',
    targetId: request.params.postId,
    userId: request.viewer.id,
    reactionType: 'like',
    enabled: false,
  });
  response.status(204).send();
});

app.post('/community/posts/:postId/favorite', requireViewer, (request, response) => {
  toggleReaction({
    entityType: 'post',
    targetId: request.params.postId,
    userId: request.viewer.id,
    reactionType: 'favorite',
    enabled: true,
  });
  response.status(204).send();
});

app.delete('/community/posts/:postId/favorite', requireViewer, (request, response) => {
  toggleReaction({
    entityType: 'post',
    targetId: request.params.postId,
    userId: request.viewer.id,
    reactionType: 'favorite',
    enabled: false,
  });
  response.status(204).send();
});

app.post('/community/comments/:commentId/like', requireViewer, (request, response) => {
  toggleReaction({
    entityType: 'comment',
    targetId: request.params.commentId,
    userId: request.viewer.id,
    reactionType: 'like',
    enabled: true,
  });
  response.status(204).send();
});

app.delete('/community/comments/:commentId/like', requireViewer, (request, response) => {
  toggleReaction({
    entityType: 'comment',
    targetId: request.params.commentId,
    userId: request.viewer.id,
    reactionType: 'like',
    enabled: false,
  });
  response.status(204).send();
});

app.post('/community/uploads/images', requireViewer, (request, response) => {
  const schema = z.object({
    filename: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    dataBase64: z.string().trim().min(1),
    width: z.number().int().positive().max(10000).default(1200),
    height: z.number().int().positive().max(10000).default(900),
  });
  const payload = schema.safeParse(request.body);

  if (!payload.success) {
    response.status(400).json({ message: payload.error.flatten() });
    return;
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  const extension = path.extname(payload.data.filename) || '.bin';
  const fileId = createId('upload');
  const relativePath = `${fileId}${extension}`;
  const fullPath = path.join(uploadsDir, relativePath);

  fs.writeFileSync(fullPath, Buffer.from(payload.data.dataBase64, 'base64'));

  const publicUrl = `/uploads/${relativePath}`;
  getDb()
    .prepare(
      `
      INSERT INTO community_uploads (
        id, user_id, file_name, mime_type, storage_path, public_url, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      fileId,
      request.viewer.id,
      payload.data.filename,
      payload.data.mimeType,
      fullPath,
      publicUrl,
      payload.data.width,
      payload.data.height,
      nowIso(),
    );

  response.status(201).json({
    url: publicUrl,
    width: payload.data.width,
    height: payload.data.height,
    mimeType: payload.data.mimeType,
  });
});

app.get('/community/users/:userId/profile', (request, response) => {
  const profile = getProfileById(request.params.userId);
  if (!profile) {
    response.status(404).json({ message: 'Profile not found.' });
    return;
  }
  response.json(profile);
});

app.get('/community/me/summary', requireViewer, (request, response) => {
  response.json(getCurrentUserSummary(request.viewer.id));
});

app.get('/community/me/posts', requireViewer, (request, response) => {
  response.json({ items: listMyPosts(request.viewer.id) });
});

app.get('/community/me/comments', requireViewer, (request, response) => {
  response.json({ items: listMyComments(request.viewer.id) });
});

app.get('/community/me/favorites', requireViewer, (request, response) => {
  response.json({ items: listMyFavorites(request.viewer.id) });
});

module.exports = {
  app,
};
