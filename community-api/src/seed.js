const { ensureSeedUsers } = require('./auth');
const { getDb } = require('./db');
const { createComment, createPost, toggleReaction } = require('./repositories');

function seed() {
  ensureSeedUsers();
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS count FROM community_posts').get().count;

  if (count > 0) {
    return;
  }

  const postOne = createPost({
    authorId: 'user-vision-02',
    title: '把参考草图变成完整作品时，我最常卡在结构统一这一步',
    content:
      '最近连续做了几组角色稿，发现第一眼吸引人的细节很多，但真正决定完成度的是结构能不能收束起来。',
    imageUrls: [
      'https://images.visiongenie.local/post-01-1.jpg',
      'https://images.visiongenie.local/post-01-2.jpg',
    ],
  });

  const postTwo = createPost({
    authorId: 'user-vision-03',
    title: '你们会把失败尝试也发出来吗？我最近反而靠这些内容拿到更多讨论',
    content:
      '以前总想等作品完全满意再发，但现在发现把失败路径写出来，反而更容易引来高质量交流。',
    imageUrls: ['https://images.visiongenie.local/post-02-1.jpg'],
  });

  const postThree = createPost({
    authorId: 'user-vision-01',
    title: '社区首页首批信息架构建议：推荐、最新、热门足够启动 MVP',
    content:
      '如果一期目标是把内容生产和互动闭环先跑起来，首页的信息架构不宜太复杂。推荐可以先复用热门结果。',
    imageUrls: [],
  });

  createComment({
    postId: postOne.id,
    authorId: 'user-vision-01',
    content: '把过程拆给别人看这点特别认同，社区价值就体现在这里。',
  });

  createComment({
    postId: postThree.id,
    authorId: 'user-vision-02',
    content: '推荐先复用热门这个折中很合理，先把闭环跑通。',
  });

  toggleReaction({
    entityType: 'post',
    targetId: postOne.id,
    userId: 'user-vision-01',
    reactionType: 'like',
    enabled: true,
  });
  toggleReaction({
    entityType: 'post',
    targetId: postOne.id,
    userId: 'user-vision-03',
    reactionType: 'favorite',
    enabled: true,
  });
  toggleReaction({
    entityType: 'post',
    targetId: postTwo.id,
    userId: 'user-vision-01',
    reactionType: 'like',
    enabled: true,
  });
}

module.exports = {
  seed,
};

if (require.main === module) {
  seed();
}
