const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');
const request = require('supertest');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const hasMysqlConfig = Boolean(
  process.env.COMMUNITY_MYSQL_HOST &&
    process.env.COMMUNITY_MYSQL_PORT &&
    process.env.COMMUNITY_MYSQL_USER &&
    process.env.COMMUNITY_MYSQL_PASSWORD,
);
const canRunMysqlTests =
  hasMysqlConfig && String(process.env.RUN_COMMUNITY_MYSQL_TESTS || '0') === '1';
const integrationTest = canRunMysqlTests ? test : test.skip;
const originalDatabaseName = process.env.COMMUNITY_MYSQL_DATABASE || 'visiongenie_community';
const testDatabaseName =
  process.env.COMMUNITY_MYSQL_TEST_DATABASE || `${originalDatabaseName}_test`;

const authHeaders = {
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

let app;
let appFactory;
let resetDb;

test.before(async () => {
  if (!canRunMysqlTests) {
    return;
  }

  process.env.COMMUNITY_MYSQL_DATABASE = testDatabaseName;
  ({ resetDb } = require('../src/db'));
  ({ createApp: appFactory } = require('../src/app'));
  app = await appFactory();
});

test.beforeEach(async () => {
  if (!canRunMysqlTests) {
    return;
  }

  await resetDb();
  app = await appFactory();
});

test.after(async () => {
  if (!canRunMysqlTests) {
    return;
  }

  await resetDb();
  process.env.COMMUNITY_MYSQL_DATABASE = originalDatabaseName;
});

integrationTest('returns feed items', async () => {
  const response = await request(app).get('/community/feed');

  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.items), true);
  assert.equal(response.body.items.length > 0, true);
});

integrationTest('creates a post and returns detail payload', async () => {
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

integrationTest('requires auth for create post', async () => {
  const response = await request(app).post('/community/posts').send({
    title: '匿名帖子',
    content: '不应创建成功',
    imageUrls: [],
  });

  assert.equal(response.statusCode, 401);
});

integrationTest('creates comment and updates comment count', async () => {
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
