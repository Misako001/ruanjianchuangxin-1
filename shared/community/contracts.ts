export const communityApiPaths = {
  baseUrl: 'http://localhost:4010',
  feed: '/community/feed',
  posts: '/community/posts',
  uploads: '/community/uploads/images',
  me: '/community/me/summary',
} as const;

export type CommunityNavigatorTab = {
  id: 'home' | 'create' | 'me';
  label: string;
};

export type FeedSort = 'recommended' | 'latest' | 'hot';

export type CommunityUserSummary = {
  id: string;
  externalAccountId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
};

export type CommunityStats = {
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
};

export type CommunityPostSummary = {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: CommunityUserSummary;
  imagePreviewUrls: string[];
  stats: CommunityStats;
};

export type CommunityPostDetail = CommunityPostSummary & {
  content: string;
  viewerContext: {
    liked: boolean;
    favorited: boolean;
    canDelete: boolean;
  };
};

export type CommunityComment = {
  id: string;
  postId: string;
  content: string;
  publishedAt: string;
  likeCount: number;
  author: CommunityUserSummary;
  parentCommentId: string | null;
  replyToUser: CommunityUserSummary | null;
};

export type CommunityProfile = CommunityUserSummary & {
  bio: string;
  stats: {
    postCount: number;
    commentCount: number;
    favoriteCount: number;
  };
};

export type CommunityFeedResponse = {
  items: CommunityPostSummary[];
  nextCursor: string | null;
  sort: FeedSort;
};

export type CreatePostInput = {
  title: string;
  content: string;
  imageUrls: string[];
};

export type CreateCommentInput = {
  content: string;
  parentCommentId?: string;
  replyToUserId?: string;
};

export type UploadImageResult = {
  url: string;
  width: number;
  height: number;
  mimeType: string;
};

export function createCommunityNavigatorTabs(): CommunityNavigatorTab[] {
  return [
    { id: 'home', label: '首页' },
    { id: 'create', label: '发帖' },
    { id: 'me', label: '我的' },
  ];
}
