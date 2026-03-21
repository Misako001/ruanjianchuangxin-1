import {
  type CommunityComment,
  type CommunityFeedSort,
  type CommunityPostDetail,
  type CommunityPostSummary,
} from '../../shared/community/contracts';
import {
  demoCommunityCommentsByPostId,
  demoCommunityFeedBySort,
  demoCommunityPostDetails,
  demoCommunityPosts,
  demoCurrentUser,
  getDemoPostDetail,
} from '../../shared/community/demoData';

const communityApiPaths = {
  baseUrl: process.env.COMMUNITY_API_BASE_URL ?? 'http://localhost:4010',
  feed: '/community/feed',
  me: '/community/me/summary',
  posts: '/community/posts',
};

const communityApiHeaders = {
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

type ApiAuthor = {
  id: string;
  bio?: string | null;
  displayName: string;
  handle?: string | null;
};

type ApiFeedPost = {
  author: ApiAuthor;
  id: string;
  imagePreviewUrls?: string[];
  publishedAt: string;
  stats: {
    commentCount: number;
    favoriteCount: number;
    likeCount: number;
  };
  title: string;
  excerpt: string;
};

type ApiPostDetail = ApiFeedPost & {
  content: string;
  viewerContext?: {
    canDelete?: boolean;
    favorited?: boolean;
    liked?: boolean;
  };
};

type ApiComment = {
  author: ApiAuthor;
  content: string;
  id: string;
  likeCount?: number;
  postId: string;
  publishedAt: string;
};

export type CommunityFeedResponse = {
  items: CommunityPostSummary[];
  nextCursor: string | null;
  sort: CommunityFeedSort;
};

export type CommunityProfile = {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  roleLabel: string;
  city: string;
  stats: {
    postCount: number;
    commentCount: number;
    favoriteCount: number;
  };
};

export async function getCommunityFeed(
  sort: CommunityFeedSort = 'recommended',
): Promise<CommunityFeedResponse> {
  try {
    const payload = await communityApiFetch<{
      items: ApiFeedPost[];
      nextCursor: string | null;
      sort: CommunityFeedSort;
    }>(`${communityApiPaths.feed}?sort=${sort}`);

    return {
      items: payload.items.map(mapFeedPost),
      nextCursor: payload.nextCursor,
      sort: payload.sort ?? sort,
    };
  } catch {
    return {
      items: demoCommunityFeedBySort[sort] ?? demoCommunityPosts,
      nextCursor: null,
      sort,
    };
  }
}

export async function getPostDetail(postId: string): Promise<CommunityPostDetail | null> {
  try {
    const payload = await communityApiFetch<ApiPostDetail>(
      `${communityApiPaths.posts}/${postId}`,
    );

    return mapPostDetail(payload);
  } catch {
    return getDemoPostDetail(postId) ?? null;
  }
}

export async function getPostComments(postId: string): Promise<CommunityComment[]> {
  try {
    const payload = await communityApiFetch<{ items: ApiComment[] }>(
      `${communityApiPaths.posts}/${postId}/comments`,
    );

    return payload.items.map(mapComment);
  } catch {
    return demoCommunityCommentsByPostId[postId] ?? [];
  }
}

export async function getMyProfile(): Promise<CommunityProfile> {
  try {
    const payload = await communityApiFetch<Record<string, unknown>>(communityApiPaths.me);

    return {
      id: String(payload.id ?? demoCurrentUser.id),
      displayName: String(
        payload.displayName ?? payload.name ?? demoCurrentUser.name,
      ),
      handle: String(
        payload.handle ??
          buildHandle(String(payload.displayName ?? payload.name ?? demoCurrentUser.name)),
      ),
      bio: String(payload.bio ?? demoCurrentUser.bio ?? ''),
      roleLabel: String(payload.roleLabel ?? '视觉创作实验者'),
      city: String(payload.city ?? 'Shanghai'),
      stats: {
        postCount: Number(
          (payload.stats as Record<string, unknown> | undefined)?.postCount ??
            demoCommunityPosts.filter(post => post.author.id === demoCurrentUser.id).length,
        ),
        commentCount: Number(
          (payload.stats as Record<string, unknown> | undefined)?.commentCount ??
            countMyComments(),
        ),
        favoriteCount: Number(
          (payload.stats as Record<string, unknown> | undefined)?.favoriteCount ??
            countFavoritePosts(),
        ),
      },
    };
  } catch {
    return createDemoProfile();
  }
}

export async function getMyPosts(): Promise<CommunityPostSummary[]> {
  const feed = await getCommunityFeed('latest');
  return feed.items.filter(post => post.author.id === demoCurrentUser.id);
}

export async function getFavoritePosts(): Promise<CommunityPostSummary[]> {
  const feed = await getCommunityFeed('recommended');
  return feed.items.filter(post => post.viewerContext.favorited);
}

export function summarizePostCard(post: CommunityPostSummary) {
  return `${post.author.name} · ${post.stats.likeCount} 赞 · ${post.stats.commentCount} 评论`;
}

export function formatPublishDate(isoDate: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(isoDate));
}

export function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(isoDate));
}

export function mapComment(comment: ApiComment): CommunityComment {
  return {
    author: mapAuthor(comment.author),
    content: comment.content,
    id: comment.id,
    postId: comment.postId,
    publishedAt: comment.publishedAt,
  };
}

function mapFeedPost(post: ApiFeedPost): CommunityPostSummary {
  return {
    author: mapAuthor(post.author),
    id: post.id,
    images: (post.imagePreviewUrls ?? []).map((url, index) => ({
      alt: `${post.title} 配图 ${index + 1}`,
      id: `${post.id}-image-${index + 1}`,
      url: normalizeAssetUrl(url),
    })),
    publishedAt: post.publishedAt,
    stats: { ...post.stats },
    summary: post.excerpt,
    title: post.title,
    viewerContext: {
      favorited: false,
      liked: false,
    },
  };
}

function mapPostDetail(post: ApiPostDetail): CommunityPostDetail {
  const summaryPost = mapFeedPost(post);

  return {
    ...summaryPost,
    content: post.content,
    viewerContext: {
      favorited: Boolean(post.viewerContext?.favorited),
      liked: Boolean(post.viewerContext?.liked),
    },
  };
}

function mapAuthor(author: ApiAuthor) {
  const displayName = author.displayName ?? 'VisionGenie 用户';

  return {
    avatarText: createAvatarText(displayName),
    bio: author.bio ?? undefined,
    id: author.id,
    name: displayName,
  };
}

function normalizeAssetUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `${communityApiPaths.baseUrl}${url}`;
}

async function communityApiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${communityApiPaths.baseUrl}${path}`, {
    cache: 'no-store',
    headers: communityApiHeaders,
  });

  if (!response.ok) {
    throw new Error(`Community API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function createDemoProfile(): CommunityProfile {
  return {
    bio: demoCurrentUser.bio ?? '持续记录 AI 创作过程、审美实验与社区讨论。',
    city: 'Shanghai',
    displayName: demoCurrentUser.name,
    handle: buildHandle(demoCurrentUser.name),
    id: demoCurrentUser.id,
    roleLabel: '视觉创作实验者',
    stats: {
      commentCount: countMyComments(),
      favoriteCount: countFavoritePosts(),
      postCount: demoCommunityPosts.filter(post => post.author.id === demoCurrentUser.id)
        .length,
    },
  };
}

function buildHandle(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function createAvatarText(name: string) {
  return name.replace(/\s+/g, '').slice(0, 2).toUpperCase();
}

function countMyComments() {
  return Object.values(demoCommunityCommentsByPostId)
    .flat()
    .filter(comment => comment.author.id === demoCurrentUser.id).length;
}

function countFavoritePosts() {
  return Object.values(demoCommunityPostDetails).filter(post => post.viewerContext.favorited)
    .length;
}
