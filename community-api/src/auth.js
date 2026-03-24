const { getDb } = require('./db');
const { createId, nowIso } = require('./helpers');
const { devAuthToken } = require('./config');

const seedUsers = [
  {
    bio: '记录创作过程，也常来社区里聊模型、渲染和工作流。',
    displayName: '晨星工坊',
    externalAccountId: 'visiongenie-main-user-01',
    handle: 'starlab',
    id: 'user-vision-01',
  },
  {
    bio: '偏爱做风格实验，喜欢把参考图和失败过程一起发出来。',
    displayName: '山海像素',
    externalAccountId: 'visiongenie-main-user-02',
    handle: 'seapixel',
    id: 'user-vision-02',
  },
  {
    bio: '主做 3D 结构与材质探索，也会分享调参踩坑记录。',
    displayName: '零号建模站',
    externalAccountId: 'visiongenie-main-user-03',
    handle: 'meshzero',
    id: 'user-vision-03',
  },
];

async function ensureSeedUsers() {
  const db = await getDb();
  const statement = `
    INSERT INTO community_users (
      id, external_account_id, display_name, handle, avatar_url, bio, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id = id
  `;

  for (const user of seedUsers) {
    await db.execute(statement, [
      user.id,
      user.externalAccountId,
      user.displayName,
      user.handle,
      null,
      user.bio,
      nowIso(),
      nowIso(),
    ]);
  }

  return seedUsers;
}

async function resolveViewer(request) {
  await ensureSeedUsers();

  const token = request.header('x-community-dev-token');
  const externalAccountId = request.header('x-community-user-id');
  const db = await getDb();

  if (externalAccountId) {
    const [rows] = await db.execute(
      `
        SELECT id, external_account_id, display_name, handle, avatar_url
        FROM community_users
        WHERE external_account_id = ?
        LIMIT 1
      `,
      [externalAccountId],
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        avatarUrl: row.avatar_url,
        displayName: row.display_name,
        externalAccountId: row.external_account_id,
        handle: row.handle,
        id: row.id,
      };
    }
  }

  if (token === devAuthToken) {
    const [rows] = await db.execute(
      `
        SELECT id, external_account_id, display_name, handle, avatar_url
        FROM community_users
        WHERE id = ?
        LIMIT 1
      `,
      ['user-vision-01'],
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        avatarUrl: row.avatar_url,
        displayName: row.display_name,
        externalAccountId: row.external_account_id,
        handle: row.handle,
        id: row.id,
      };
    }
  }

  return null;
}

async function requireViewer(request, response, next) {
  try {
    const viewer = await resolveViewer(request);
    if (!viewer) {
      response.status(401).json({ message: 'Authentication required for this action.' });
      return;
    }

    request.viewer = viewer;
    next();
  } catch (error) {
    next(error);
  }
}

async function attachOptionalViewer(request, _response, next) {
  try {
    request.viewer = await resolveViewer(request);
    next();
  } catch (error) {
    next(error);
  }
}

async function ensureProfileFromExternalAccount(externalAccountId, fallbackName) {
  const db = await getDb();
  const [existingRows] = await db.execute(
    `
      SELECT id
      FROM community_users
      WHERE external_account_id = ?
      LIMIT 1
    `,
    [externalAccountId],
  );

  if (existingRows.length > 0) {
    return existingRows[0].id;
  }

  const createdId = createId('user');
  await db.execute(
    `
      INSERT INTO community_users (
        id, external_account_id, display_name, handle, avatar_url, bio, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      createdId,
      externalAccountId,
      fallbackName,
      `${fallbackName.toLowerCase().replace(/\s+/g, '')}-${createdId.slice(-6)}`,
      null,
      '',
      nowIso(),
      nowIso(),
    ],
  );

  return createdId;
}

module.exports = {
  attachOptionalViewer,
  ensureProfileFromExternalAccount,
  ensureSeedUsers,
  requireViewer,
};
