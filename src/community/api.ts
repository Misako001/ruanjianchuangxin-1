import { Asset } from 'react-native-image-picker';

import {
  CommunityComment,
  CommunityFeedSort,
  CommunityImageAsset,
  CommunityPostDetail,
  CommunityPostSummary,
} from '../../shared/community/contracts';

const COMMUNITY_API_BASE_URL = 'http://127.0.0.1:4010';
const COMMUNITY_DEV_HEADERS = {
  'Content-Type': 'application/json',
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

type ApiAuthor = {
  id: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string | null;
  bio?: string;
};

type ApiFeedPost = {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: ApiAuthor;
  imagePreviewUrls: string[];
  stats: {
    likeCount: number;
    commentCount: number;
    favoriteCount: number;
  };
};

type ApiPostDetail = ApiFeedPost & {
  content: string;
  viewerContext?: {
    liked?: boolean;
    favorited?: boolean;
    canDelete?: boolean;
  };
};

type ApiComment = {
  id: string;
  postId: string;
  content: string;
  publishedAt: string;
  likeCount?: number;
  author: ApiAuthor;
};

type ApiFeedResponse = {
  items: ApiFeedPost[];
  nextCursor: string | null;
  sort: CommunityFeedSort;
};

type ApiCommentsResponse = {
  items: ApiComment[];
  nextCursor: string | null;
};

type UploadResponse = {
  url: string;
  width?: number;
  height?: number;
  mimeType?: string;
};

export async function fetchCommunityFeed(
  sort: CommunityFeedSort,
): Promise<CommunityPostSummary[]> {
  const response = await fetchJson<ApiFeedResponse>(`/community/feed?sort=${sort}`);
  return response.items.map(mapFeedPost);
}

export async function fetchCommunityPostDetail(
  postId: string,
): Promise<CommunityPostDetail> {
  const response = await fetchJson<ApiPostDetail>(`/community/posts/${postId}`);
  return mapPostDetail(response);
}

export async function fetchCommunityComments(
  postId: string,
): Promise<CommunityComment[]> {
  const response = await fetchJson<ApiCommentsResponse>(
    `/community/posts/${postId}/comments`,
  );
  return response.items.map(mapComment);
}

export async function submitCommunityComment(
  postId: string,
  content: string,
): Promise<CommunityComment> {
  const response = await fetchJson<ApiComment>(`/community/posts/${postId}/comments`, {
    body: JSON.stringify({ content }),
    method: 'POST',
  });

  return mapComment(response);
}

export async function setCommunityPostLike(
  postId: string,
  enabled: boolean,
): Promise<void> {
  await fetchJson(
    `/community/posts/${postId}/like`,
    enabled ? { method: 'POST' } : { method: 'DELETE' },
  );
}

export async function setCommunityPostFavorite(
  postId: string,
  enabled: boolean,
): Promise<void> {
  await fetchJson(
    `/community/posts/${postId}/favorite`,
    enabled ? { method: 'POST' } : { method: 'DELETE' },
  );
}

export async function uploadCommunityImage(
  asset: Asset,
): Promise<{ url: string } | null> {
  if (!asset.base64 || !asset.uri) {
    return null;
  }

  const response = await fetchJson<UploadResponse>('/community/uploads/images', {
    body: JSON.stringify({
      dataBase64: asset.base64,
      filename: asset.fileName || `upload-${Date.now()}.jpg`,
      height: asset.height || 900,
      mimeType: asset.type || 'image/jpeg',
      width: asset.width || 1200,
    }),
    method: 'POST',
  });

  return {
    url: normalizeUrl(response.url),
  };
}

export async function createCommunityPost(input: {
  title: string;
  content: string;
  imageUrls: string[];
}): Promise<CommunityPostDetail> {
  const response = await fetchJson<ApiPostDetail>('/community/posts', {
    body: JSON.stringify(input),
    method: 'POST',
  });

  return mapPostDetail(response);
}

function mapFeedPost(post: ApiFeedPost): CommunityPostSummary {
  return {
    author: mapAuthor(post.author),
    id: post.id,
    images: mapImages(post.imagePreviewUrls, post.title),
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
  return {
    ...mapFeedPost(post),
    content: post.content,
    viewerContext: {
      favorited: Boolean(post.viewerContext?.favorited),
      liked: Boolean(post.viewerContext?.liked),
    },
  };
}

function mapComment(comment: ApiComment): CommunityComment {
  return {
    author: mapAuthor(comment.author),
    content: comment.content,
    id: comment.id,
    postId: comment.postId,
    publishedAt: comment.publishedAt,
  };
}

function mapAuthor(author: ApiAuthor) {
  return {
    avatarText: createAvatarText(author.displayName),
    bio: author.bio,
    id: author.id,
    name: author.displayName,
  };
}

function mapImages(imagePreviewUrls: string[], title: string): CommunityImageAsset[] {
  return imagePreviewUrls.map((imageUrl, index) => ({
    alt: `${title} 配图 ${index + 1}`,
    id: `${title}-${index}`,
    url: normalizeUrl(imageUrl),
  }));
}

function normalizeUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('content://')) {
    return url;
  }

  return `${COMMUNITY_API_BASE_URL}${url}`;
}

function createAvatarText(displayName: string) {
  const cleaned = displayName.replace(/\s+/g, '');
  return cleaned.slice(0, 2).toUpperCase();
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${COMMUNITY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...COMMUNITY_DEV_HEADERS,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
