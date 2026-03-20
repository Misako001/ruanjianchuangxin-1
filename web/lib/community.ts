import {
  communityApiPaths,
  type CommunityFeedResponse,
  type CommunityPostDetail,
  type CommunityPostSummary,
  type CommunityProfile,
} from '../../shared/community/contracts';
import {
  demoFeed,
  demoMyProfile,
  getDemoPostById,
} from '../../shared/community/demoData';

export async function getCommunityFeed(): Promise<CommunityFeedResponse> {
  try {
    const response = await fetch(
      `${communityApiPaths.baseUrl}${communityApiPaths.feed}?sort=recommended`,
      {
        cache: 'no-store',
        headers: {
          'x-community-dev-token': 'visiongenie-community-dev-token',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch feed');
    }

    return (await response.json()) as CommunityFeedResponse;
  } catch {
    return {
      items: demoFeed,
      nextCursor: null,
      sort: 'recommended',
    };
  }
}

export async function getPostDetail(postId: string): Promise<CommunityPostDetail | null> {
  try {
    const response = await fetch(
      `${communityApiPaths.baseUrl}${communityApiPaths.posts}/${postId}`,
      {
        cache: 'no-store',
        headers: {
          'x-community-dev-token': 'visiongenie-community-dev-token',
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as CommunityPostDetail;
  } catch {
    return getDemoPostById(postId);
  }
}

export async function getMyProfile(): Promise<CommunityProfile> {
  try {
    const response = await fetch(
      `${communityApiPaths.baseUrl}${communityApiPaths.me}`,
      {
        cache: 'no-store',
        headers: {
          'x-community-dev-token': 'visiongenie-community-dev-token',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    return (await response.json()) as CommunityProfile;
  } catch {
    return demoMyProfile;
  }
}

export function summarizePostCard(post: CommunityPostSummary) {
  return `${post.author.displayName} · ${post.stats.likeCount} 赞 · ${post.stats.commentCount} 评论`;
}
