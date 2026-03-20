const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.COMMUNITY_API_DB_PATH = ':memory:';

const { app } = require('../src/app');
const { resetDb } = require('../src/db');
const { seed } = require('../src/seed');

const authHeaders = {
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

test.beforeEach(() => {
  resetDb();
  seed();
});

test('returns feed items', async () => {
  const response = await request(app).get('/community/feed');

  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.items), true);
  assert.equal(response.body.items.length > 0, true);
});

test('creates a post and returns detail payload', async () => {
  const response = await request(app)
    .post('/community/posts')
    .set(authHeaders)
    .send({
      title: '测试帖子',
      content: '这是一个用于验证创建接口的帖子内容。',
      imageUrls: ['https://images.visiongenie.local/test.jpg'],
    });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.title, '测试帖子');
  assert.equal(response.body.imagePreviewUrls.length, 1);
  assert.equal(response.body.viewerContext.canDelete, true);
});

test('requires auth for create post', async () => {
  const response = await request(app).post('/community/posts').send({
    title: '匿名帖子',
    content: '不应创建成功',
    imageUrls: [],
  });

  assert.equal(response.statusCode, 401);
});

test('creates comment and updates comment count', async () => {
  const feedResponse = await request(app).get('/community/feed');
  const postId = feedResponse.body.items[0].id;

  const commentResponse = await request(app)
    .post(`/community/posts/${postId}/comments`)
    .set(authHeaders)
    .send({
      content: '这里是测试评论。',
    });

  assert.equal(commentResponse.statusCode, 201);

  const detailResponse = await request(app).get(`/community/posts/${postId}`);
  assert.equal(detailResponse.body.stats.commentCount >= 1, true);
});
