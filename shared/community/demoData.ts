import type {
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  CommunityProfile,
  CommunityUserSummary,
} from './contracts';

export const demoCurrentUser: CommunityUserSummary = {
  id: 'user-vision-01',
  externalAccountId: 'visiongenie-main-user-01',
  displayName: '晨星工坊',
  handle: 'starlab',
  avatarUrl: null,
};

export const demoProfiles: CommunityProfile[] = [
  {
    ...demoCurrentUser,
    bio: '记录创作过程，也常来社区里聊模型、渲染和工作流。',
    stats: { postCount: 18, commentCount: 64, favoriteCount: 29 },
  },
  {
    id: 'user-vision-02',
    externalAccountId: 'visiongenie-main-user-02',
    displayName: '山海像素',
    handle: 'seapixel',
    avatarUrl: null,
    bio: '偏爱做风格实验，喜欢把参考图和失败过程一起发出来。',
    stats: { postCount: 33, commentCount: 105, favoriteCount: 51 },
  },
  {
    id: 'user-vision-03',
    externalAccountId: 'visiongenie-main-user-03',
    displayName: '零号建模站',
    handle: 'meshzero',
    avatarUrl: null,
    bio: '主做 3D 结构与材质探索，也会分享调参踩坑记录。',
    stats: { postCount: 12, commentCount: 40, favoriteCount: 16 },
  },
];

export const demoMyProfile = demoProfiles[0];

const detailFeed: CommunityPostDetail[] = [
  {
    id: 'post-01',
    title: '把参考草图变成完整作品时，我最常卡在结构统一这一步',
    excerpt:
      '最近连续做了几组角色稿，发现第一眼吸引人的细节很多，但真正决定完成度的是结构能不能收束起来。',
    content:
      '最近连续做了几组角色稿，发现第一眼吸引人的细节很多，但真正决定完成度的是结构能不能收束起来。现在我的做法是先把大块体拆干净，再回头补材质和小装饰，这样在社区里分享时也更容易让别人复现流程。首期社区我特别希望能承载这种“过程型内容”，不只是晒最终图。',
    publishedAt: '2026-03-18T09:30:00.000Z',
    author: demoProfiles[1],
    imagePreviewUrls: [
      'https://images.visiongenie.local/post-01-1.jpg',
      'https://images.visiongenie.local/post-01-2.jpg',
    ],
    stats: { likeCount: 182, commentCount: 27, favoriteCount: 49 },
    viewerContext: { liked: true, favorited: false, canDelete: false },
  },
  {
    id: 'post-02',
    title: '你们会把失败尝试也发出来吗？我最近反而靠这些内容拿到更多讨论',
    excerpt:
      '以前总想等作品完全满意再发，但现在发现把失败路径写出来，反而更容易引来高质量交流。',
    content:
      '以前总想等作品完全满意再发，但现在发现把失败路径写出来，反而更容易引来高质量交流。社区如果能把帖子、评论、收藏串起来，用户会更愿意沉淀经验，而不是只追求一次性曝光。',
    publishedAt: '2026-03-17T13:15:00.000Z',
    author: demoProfiles[2],
    imagePreviewUrls: ['https://images.visiongenie.local/post-02-1.jpg'],
    stats: { likeCount: 96, commentCount: 34, favoriteCount: 17 },
    viewerContext: { liked: false, favorited: true, canDelete: false },
  },
  {
    id: 'post-03',
    title: '社区首页首批信息架构建议：推荐、最新、热门足够启动 MVP',
    excerpt:
      '如果一期目标是把内容生产和互动闭环先跑起来，首页的信息架构不宜太复杂。',
    content:
      '如果一期目标是把内容生产和互动闭环先跑起来，首页的信息架构不宜太复杂。推荐可以先复用热门结果，后续再引入个性化；最新承担内容发现；热门负责讨论气氛。这样 App 和 Web 都更容易共用同一套接口。',
    publishedAt: '2026-03-19T05:45:00.000Z',
    author: demoCurrentUser,
    imagePreviewUrls: [],
    stats: { likeCount: 64, commentCount: 11, favoriteCount: 23 },
    viewerContext: { liked: false, favorited: false, canDelete: true },
  },
];

export const demoFeed: CommunityPostSummary[] = detailFeed.map(
  ({ content: _content, viewerContext: _viewerContext, ...post }) => post,
);

export const demoRecommendedIds = ['post-01', 'post-03', 'post-02'];

const demoComments: CommunityComment[] = [
  {
    id: 'comment-01',
    postId: 'post-01',
    content: '把过程拆给别人看这点特别认同，社区价值就体现在这里。',
    publishedAt: '2026-03-18T10:20:00.000Z',
    likeCount: 16,
    author: demoCurrentUser,
    parentCommentId: null,
    replyToUser: null,
  },
  {
    id: 'comment-02',
    postId: 'post-01',
    content: '我也是先清结构后补装饰，不然越做越乱。',
    publishedAt: '2026-03-18T11:10:00.000Z',
    likeCount: 8,
    author: demoProfiles[2],
    parentCommentId: 'comment-01',
    replyToUser: demoCurrentUser,
  },
  {
    id: 'comment-03',
    postId: 'post-03',
    content: '推荐先复用热门这个折中很合理，先把闭环跑通。',
    publishedAt: '2026-03-19T07:10:00.000Z',
    likeCount: 11,
    author: demoProfiles[1],
    parentCommentId: null,
    replyToUser: null,
  },
];

export function getDemoPostById(postId: string) {
  return detailFeed.find(post => post.id === postId) ?? null;
}

export function getDemoCommentsByPostId(postId: string) {
  return demoComments.filter(comment => comment.postId === postId);
}
