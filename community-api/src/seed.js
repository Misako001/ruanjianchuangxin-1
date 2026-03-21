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
    postId: 'post-01',
    authorId: 'user-vision-02',
    publishedAt: '2026-03-18T10:30:00.000Z',
    title: '把夜景照片调成电影蓝调的三个步骤',
    content:
      '我用 Vision Genie 做了一次夜景改色，发现先压暗高光再提亮中间调很稳。第一步先把画面的高光区域压下来，避免霓虹灯直接炸掉；第二步用偏青蓝的中间调覆盖街景，让主体和背景的关系更统一；第三步再轻微提一点肤色或主体的暖色，画面会更有层次。',
    imageUrls: ['https://images.example.com/community/post-01.jpg'],
  });

  const postTwo = createPost({
    postId: 'post-02',
    authorId: 'user-vision-03',
    publishedAt: '2026-03-19T04:20:00.000Z',
    title: '3D 建模功能适合拿来做产品草模吗？',
    content:
      '今天试着用手机快速扫了个摆件，想讨论一下这套流程更适合概念验证还是成品输出。目前我的感受是，作为灵感验证非常快，尤其适合和调色、画面包装一起走。但如果要直接给工业级精度，还是需要后面再做一次精修。',
    imageUrls: [],
  });

  const postThree = createPost({
    postId: 'post-03',
    authorId: 'user-vision-01',
    publishedAt: '2026-03-19T13:45:00.000Z',
    title: '把灵感板变成一个可执行的拍摄清单',
    content:
      '我最近会先在社区里记录构图和关键词，再反推拍摄顺序，效率提升不少。先把想要的情绪、颜色和主体动作写下来，再标记哪些需要 AI 调色、哪些要靠实拍完成，最后组合成真正可执行的拍摄清单。',
    imageUrls: [],
  });

  createComment({
    commentId: 'comment-01',
    postId: postOne.id,
    authorId: 'user-vision-01',
    publishedAt: '2026-03-18T11:00:00.000Z',
    content: '这个分步思路很清晰，我回头也试试先压高光。',
  });

  createComment({
    commentId: 'comment-02',
    postId: postOne.id,
    authorId: 'user-vision-03',
    publishedAt: '2026-03-18T12:10:00.000Z',
    content: '最后补一点暖色真的很关键，不然人物会显得有点冷。',
  });

  createComment({
    commentId: 'comment-03',
    postId: postTwo.id,
    authorId: 'user-vision-02',
    publishedAt: '2026-03-19T05:05:00.000Z',
    content: '我更偏向概念验证，不过前期出稿真的非常快。',
  });

  createComment({
    commentId: 'comment-04',
    postId: postThree.id,
    authorId: 'user-vision-02',
    publishedAt: '2026-03-19T14:20:00.000Z',
    content: '这个方法很适合团队协作时统一目标。',
  });

  createComment({
    commentId: 'comment-05',
    postId: postThree.id,
    authorId: 'user-vision-03',
    publishedAt: '2026-03-19T15:00:00.000Z',
    content: '想看你后面是怎么把清单映射到拍摄流程里的。',
  });

  createComment({
    commentId: 'comment-06',
    postId: postThree.id,
    authorId: 'user-vision-01',
    publishedAt: '2026-03-19T15:40:00.000Z',
    content: '这个思路和灵感采集功能也能接起来。',
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
