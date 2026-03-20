const { getDb } = require('./db');
const { createId, nowIso } = require('./helpers');
const { devAuthToken } = require('./config');

function ensureSeedUsers() {
  const db = getDb();
  const users = [
    {
      id: 'user-vision-01',
      externalAccountId: 'visiongenie-main-user-01',
      displayName: '晨星工坊',
      handle: 'starlab',
      bio: '记录创作过程，也常来社区里聊模型、渲染和工作流。',
    },
    {
      id: 'user-vision-02',
      externalAccountId: 'visiongenie-main-user-02',
      displayName: '山海像素',
      handle: 'seapixel',
      bio: '偏爱做风格实验，喜欢把参考图和失败过程一起发出来。',
    },
    {
      id: 'user-vision-03',
      externalAccountId: 'visiongenie-main-user-03',
      displayName: '零号建模站',
      handle: 'meshzero',
      bio: '主做 3D 结构与材质探索，也会分享调参踩坑记录。',
    },
  ];

  const insert = db.prepare(
    `
    INSERT OR IGNORE INTO community_users (
      id, external_account_id, display_name, handle, avatar_url, bio, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  );

  users.forEach(user => {
    insert.run(
      user.id,
      user.externalAccountId,
      user.displayName,
      user.handle,
      null,
      user.bio,
      nowIso(),
      nowIso(),
    );
  });

  return users;
}

function resolveViewer(request) {
  ensureSeedUsers();
  const token = request.header('x-community-dev-token');
  const externalAccountId = request.header('x-community-user-id');
  const db = getDb();

  if (externalAccountId) {
    const row = db
      .prepare(
        'SELECT id, external_account_id, display_name, handle, avatar_url FROM community_users WHERE external_account_id = ?',
      )
      .get(externalAccountId);

    if (row) {
      return {
        id: row.id,
        externalAccountId: row.external_account_id,
        displayName: row.display_name,
        handle: row.handle,
        avatarUrl: row.avatar_url,
      };
    }
  }

  if (token === devAuthToken) {
    const row = db
      .prepare(
        'SELECT id, external_account_id, display_name, handle, avatar_url FROM community_users WHERE id = ?',
      )
      .get('user-vision-01');

    return {
      id: row.id,
      externalAccountId: row.external_account_id,
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
    };
  }

  return null;
}

function requireViewer(request, response, next) {
  const viewer = resolveViewer(request);
  if (!viewer) {
    response.status(401).json({ message: 'Authentication required for this action.' });
    return;
  }

  request.viewer = viewer;
  next();
}

function attachOptionalViewer(request, _response, next) {
  request.viewer = resolveViewer(request);
  next();
}

function ensureProfileFromExternalAccount(externalAccountId, fallbackName) {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM community_users WHERE external_account_id = ?')
    .get(externalAccountId);

  if (existing) {
    return existing.id;
  }

  const createdId = createId('user');
  db.prepare(
    `
    INSERT INTO community_users (
      id, external_account_id, display_name, handle, avatar_url, bio, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    createdId,
    externalAccountId,
    fallbackName,
    `${fallbackName.toLowerCase().replace(/\s+/g, '')}-${createdId.slice(-6)}`,
    null,
    '',
    nowIso(),
    nowIso(),
  );

  return createdId;
}

module.exports = {
  attachOptionalViewer,
  ensureProfileFromExternalAccount,
  ensureSeedUsers,
  requireViewer,
};
