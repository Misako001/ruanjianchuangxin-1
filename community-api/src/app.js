const express = require('express');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const { uploadsDir } = require('./config');
const { attachOptionalViewer, requireViewer } = require('./auth');
const {
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
} = require('./repositories');
const { createId } = require('./helpers');
const { getDb } = require('./db');
const { seed } = require('./seed');

async function createApp() {
  await getDb();
  await seed();

  const app = express();

  app.use(express.json({ limit: '8mb' }));
  app.use('/uploads', express.static(uploadsDir));
  app.use(attachOptionalViewer);

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get(
    '/community/feed',
    asyncHandler(async (request, response) => {
      const sort = request.query.sort || 'recommended';
      const result = await listFeed({ sort, cursor: request.query.cursor });
      response.json({
        items: result.items,
        nextCursor: result.nextCursor,
        sort,
      });
    }),
  );

  app.get(
    '/community/posts/:postId',
    asyncHandler(async (request, response) => {
      const post = await getPostDetail(request.params.postId, request.viewer?.id);
      if (!post) {
        response.status(404).json({ message: 'Post not found.' });
        return;
      }

      response.json(post);
    }),
  );

  app.post(
    '/community/posts',
    requireViewer,
    asyncHandler(async (request, response) => {
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

      const post = await createPost({
        authorId: request.viewer.id,
        content: payload.data.content,
        imageUrls: payload.data.imageUrls,
        title: payload.data.title,
      });

      response.status(201).json(post);
    }),
  );

  app.delete(
    '/community/posts/:postId',
    requireViewer,
    asyncHandler(async (request, response) => {
      const result = await softDeletePost({
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
    }),
  );

  app.get(
    '/community/posts/:postId/comments',
    asyncHandler(async (request, response) => {
      response.json(await listComments(request.params.postId, request.query.cursor));
    }),
  );

  app.post(
    '/community/posts/:postId/comments',
    requireViewer,
    asyncHandler(async (request, response) => {
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

      const comment = await createComment({
        authorId: request.viewer.id,
        content: payload.data.content,
        parentCommentId: payload.data.parentCommentId || null,
        postId: request.params.postId,
        replyToUserId: payload.data.replyToUserId || null,
      });

      response.status(201).json(comment);
    }),
  );

  app.delete(
    '/community/comments/:commentId',
    requireViewer,
    asyncHandler(async (request, response) => {
      const result = await softDeleteComment({
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
    }),
  );

  app.post(
    '/community/posts/:postId/like',
    requireViewer,
    asyncHandler(async (request, response) => {
      await toggleReaction({
        enabled: true,
        entityType: 'post',
        reactionType: 'like',
        targetId: request.params.postId,
        userId: request.viewer.id,
      });
      response.status(204).send();
    }),
  );

  app.delete(
    '/community/posts/:postId/like',
    requireViewer,
    asyncHandler(async (request, response) => {
      await toggleReaction({
        enabled: false,
        entityType: 'post',
        reactionType: 'like',
        targetId: request.params.postId,
        userId: request.viewer.id,
      });
      response.status(204).send();
    }),
  );

  app.post(
    '/community/posts/:postId/favorite',
    requireViewer,
    asyncHandler(async (request, response) => {
      await toggleReaction({
        enabled: true,
        entityType: 'post',
        reactionType: 'favorite',
        targetId: request.params.postId,
        userId: request.viewer.id,
      });
      response.status(204).send();
    }),
  );

  app.delete(
    '/community/posts/:postId/favorite',
    requireViewer,
    asyncHandler(async (request, response) => {
      await toggleReaction({
        enabled: false,
        entityType: 'post',
        reactionType: 'favorite',
        targetId: request.params.postId,
        userId: request.viewer.id,
      });
      response.status(204).send();
    }),
  );

  app.post(
    '/community/comments/:commentId/like',
    requireViewer,
    asyncHandler(async (request, response) => {
      await toggleReaction({
        enabled: true,
        entityType: 'comment',
        reactionType: 'like',
        targetId: request.params.commentId,
        userId: request.viewer.id,
      });
      response.status(204).send();
    }),
  );

  app.delete(
    '/community/comments/:commentId/like',
    requireViewer,
    asyncHandler(async (request, response) => {
      await toggleReaction({
        enabled: false,
        entityType: 'comment',
        reactionType: 'like',
        targetId: request.params.commentId,
        userId: request.viewer.id,
      });
      response.status(204).send();
    }),
  );

  app.post(
    '/community/uploads/images',
    requireViewer,
    asyncHandler(async (request, response) => {
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
      await createUploadRecord({
        fileId,
        filename: payload.data.filename,
        height: payload.data.height,
        mimeType: payload.data.mimeType,
        publicUrl,
        storagePath: fullPath,
        userId: request.viewer.id,
        width: payload.data.width,
      });

      response.status(201).json({
        height: payload.data.height,
        mimeType: payload.data.mimeType,
        url: publicUrl,
        width: payload.data.width,
      });
    }),
  );

  app.get(
    '/community/users/:userId/profile',
    asyncHandler(async (request, response) => {
      const profile = await getProfileById(request.params.userId);
      if (!profile) {
        response.status(404).json({ message: 'Profile not found.' });
        return;
      }
      response.json(profile);
    }),
  );

  app.get(
    '/community/me/summary',
    requireViewer,
    asyncHandler(async (request, response) => {
      response.json(await getCurrentUserSummary(request.viewer.id));
    }),
  );

  app.get(
    '/community/me/posts',
    requireViewer,
    asyncHandler(async (request, response) => {
      response.json({ items: await listMyPosts(request.viewer.id) });
    }),
  );

  app.get(
    '/community/me/comments',
    requireViewer,
    asyncHandler(async (request, response) => {
      response.json({ items: await listMyComments(request.viewer.id) });
    }),
  );

  app.get(
    '/community/me/favorites',
    requireViewer,
    asyncHandler(async (request, response) => {
      response.json({ items: await listMyFavorites(request.viewer.id) });
    }),
  );

  app.use((error, _request, response, _next) => {
    // eslint-disable-next-line no-console
    console.error(error);
    response.status(500).json({ message: 'Internal server error.' });
  });

  return app;
}

function asyncHandler(handler) {
  return function wrappedHandler(request, response, next) {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

module.exports = {
  createApp,
};
