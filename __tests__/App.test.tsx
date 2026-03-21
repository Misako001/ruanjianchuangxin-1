/**
 * @format
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import App from '../App';
import {
  createCommunityPost,
  fetchCommunityComments,
  fetchCommunityFeed,
  fetchCommunityPostDetail,
  setCommunityPostFavorite,
  setCommunityPostLike,
  submitCommunityComment,
  uploadCommunityImage,
} from '../src/community/api';
import {
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
} from '../shared/community/contracts';

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../src/community/api', () => ({
  createCommunityPost: jest.fn(),
  fetchCommunityComments: jest.fn(),
  fetchCommunityFeed: jest.fn(),
  fetchCommunityPostDetail: jest.fn(),
  setCommunityPostFavorite: jest.fn(),
  setCommunityPostLike: jest.fn(),
  submitCommunityComment: jest.fn(),
  uploadCommunityImage: jest.fn(),
}));

describe('App community flow', () => {
  let feedPosts: CommunityPostSummary[];
  let postDetailsById: Record<string, CommunityPostDetail>;
  let commentsByPostId: Record<string, CommunityComment[]>;

  beforeEach(() => {
    feedPosts = [
      {
        author: {
          avatarText: 'LU',
          bio: '偏爱胶片色调和夜景拍摄。',
          id: 'user-luna',
          name: 'Luna',
        },
        id: 'post-01',
        images: [
          {
            alt: '夜景蓝调示例图',
            id: 'post-01-image-01',
            url: 'https://images.example.com/community/post-01.jpg',
          },
        ],
        publishedAt: '2026-03-18T10:30:00.000Z',
        stats: {
          commentCount: 2,
          favoriteCount: 6,
          likeCount: 18,
        },
        summary: '我用 Vision Genie 做了一次夜景改色，发现先压暗高光再提亮中间调很稳。',
        title: '把夜景照片调成电影蓝调的三个步骤',
        viewerContext: {
          favorited: false,
          liked: false,
        },
      },
    ];

    postDetailsById = {
      'post-01': {
        ...feedPosts[0],
        content:
          '我用 Vision Genie 做了一次夜景改色，发现先压暗高光再提亮中间调很稳。',
      },
    };

    commentsByPostId = {
      'post-01': [
        {
          author: {
            avatarText: 'MA',
            bio: '正在尝试把建模流程做得更轻量。',
            id: 'user-mars',
            name: 'Mars',
          },
          content: '这个分步思路很清晰，我回头也试试先压高光。',
          id: 'comment-01',
          postId: 'post-01',
          publishedAt: '2026-03-18T11:00:00.000Z',
        },
        {
          author: {
            avatarText: 'NO',
            bio: '喜欢收集创意灵感和画面结构。',
            id: 'user-nova',
            name: 'Nova',
          },
          content: '最后补一点暖色真的很关键，不然人物会显得有点冷。',
          id: 'comment-02',
          postId: 'post-01',
          publishedAt: '2026-03-18T12:10:00.000Z',
        },
      ],
    };

    (fetchCommunityFeed as jest.Mock).mockImplementation(async () => feedPosts);
    (fetchCommunityPostDetail as jest.Mock).mockImplementation(async (postId: string) => {
      const post = postDetailsById[postId];
      if (!post) {
        throw new Error('post not found');
      }

      return post;
    });
    (fetchCommunityComments as jest.Mock).mockImplementation(async (postId: string) => {
      return commentsByPostId[postId] ?? [];
    });

    (setCommunityPostLike as jest.Mock).mockImplementation(async (postId: string, enabled: boolean) => {
      const detail = postDetailsById[postId];
      const feedPost = feedPosts.find(post => post.id === postId);
      if (!detail || !feedPost) {
        return;
      }

      const nextLikeCount = Math.max(0, detail.stats.likeCount + (enabled ? 1 : -1));
      detail.stats.likeCount = nextLikeCount;
      detail.viewerContext.liked = enabled;
      feedPost.stats.likeCount = nextLikeCount;
      feedPost.viewerContext.liked = enabled;
    });

    (setCommunityPostFavorite as jest.Mock).mockImplementation(
      async (postId: string, enabled: boolean) => {
        const detail = postDetailsById[postId];
        const feedPost = feedPosts.find(post => post.id === postId);
        if (!detail || !feedPost) {
          return;
        }

        const nextFavoriteCount = Math.max(
          0,
          detail.stats.favoriteCount + (enabled ? 1 : -1),
        );
        detail.stats.favoriteCount = nextFavoriteCount;
        detail.viewerContext.favorited = enabled;
        feedPost.stats.favoriteCount = nextFavoriteCount;
        feedPost.viewerContext.favorited = enabled;
      },
    );

    (submitCommunityComment as jest.Mock).mockImplementation(async (postId: string, content: string) => {
      const nextComment: CommunityComment = {
        author: {
          avatarText: 'VG',
          bio: '热爱 AI 创作、配色和社区交流。',
          id: 'user-demo',
          name: 'Vision Genie 创作者',
        },
        content,
        id: `comment-${Date.now()}`,
        postId,
        publishedAt: '2026-03-21T00:00:00.000Z',
      };

      commentsByPostId[postId] = [...(commentsByPostId[postId] ?? []), nextComment];
      postDetailsById[postId].stats.commentCount += 1;
      const feedPost = feedPosts.find(post => post.id === postId);
      if (feedPost) {
        feedPost.stats.commentCount += 1;
      }

      return nextComment;
    });

    (uploadCommunityImage as jest.Mock).mockResolvedValue({
      url: 'https://images.example.com/community/new-post.png',
    });

    (createCommunityPost as jest.Mock).mockImplementation(async input => {
      const createdPost: CommunityPostDetail = {
        author: {
          avatarText: 'VG',
          bio: '热爱 AI 创作、配色和社区交流。',
          id: 'user-demo',
          name: 'Vision Genie 创作者',
        },
        content: input.content,
        id: 'post-new',
        images: input.imageUrls.map((url: string, index: number) => ({
          alt: `${input.title} 配图 ${index + 1}`,
          id: `post-new-image-${index + 1}`,
          url,
        })),
        publishedAt: '2026-03-21T01:00:00.000Z',
        stats: {
          commentCount: 0,
          favoriteCount: 0,
          likeCount: 0,
        },
        summary: input.content,
        title: input.title,
        viewerContext: {
          favorited: false,
          liked: false,
        },
      };

      postDetailsById[createdPost.id] = createdPost;
      commentsByPostId[createdPost.id] = [];
      feedPosts = [
        {
          ...createdPost,
        },
        ...feedPosts,
      ];

      return createdPost;
    });
  });

  it('renders synced homepage posts and supports detail interactions', async () => {
    const screen = render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('community-post-card-post-01')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('community-post-card-post-01'));

    await waitFor(() => expect(screen.getByText('返回首页')).toBeTruthy());
    expect(flattenText(screen.getByTestId('community-post-detail-like'))).toContain(
      '点赞 18',
    );

    fireEvent.press(screen.getByTestId('community-post-detail-like'));
    await waitFor(() =>
      expect(flattenText(screen.getByTestId('community-post-detail-like'))).toContain(
        '已点赞 19',
      ),
    );

    fireEvent.press(screen.getByTestId('community-post-detail-favorite'));
    await waitFor(() =>
      expect(
        flattenText(screen.getByTestId('community-post-detail-favorite')),
      ).toContain('已收藏 7'),
    );

    fireEvent.changeText(
      screen.getByTestId('community-post-detail-comment-input'),
      '这条评论来自测试',
    );
    fireEvent.press(screen.getByTestId('community-post-detail-comment-submit'));

    await waitFor(() => expect(screen.getByText('这条评论来自测试')).toBeTruthy());

    fireEvent.press(screen.getByTestId('community-post-detail-back'));
    await waitFor(() =>
      expect(screen.getByTestId('community-post-card-post-01')).toBeTruthy(),
    );
  });

  it('creates a synced post from profile and opens the new detail view', async () => {
    const screen = render(<App />);

    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [
        {
          base64: 'ZmFrZS1pbWFnZS1kYXRh',
          fileName: 'test-post.png',
          fileSize: 10240,
          uri: 'content://test-post.png',
        },
      ],
      didCancel: false,
    });

    await waitFor(() =>
      expect(screen.getByTestId('community-post-card-post-01')).toBeTruthy(),
    );

    fireEvent.press(screen.getByText('我的'));

    fireEvent.changeText(
      screen.getByTestId('create-post-title-input'),
      '测试发帖标题',
    );
    fireEvent.changeText(
      screen.getByTestId('create-post-content-input'),
      '这是一个用于验证发帖流程的帖子正文。',
    );
    fireEvent.press(screen.getByTestId('create-post-image-select'));
    await waitFor(() =>
      expect(screen.getByTestId('create-post-image-preview')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('create-post-submit'));

    await waitFor(() => expect(screen.getByText('测试发帖标题')).toBeTruthy());
    expect(screen.getByText('这是一个用于验证发帖流程的帖子正文。')).toBeTruthy();
    expect(screen.getByText('https://images.example.com/community/new-post.png')).toBeTruthy();

    fireEvent.press(screen.getByTestId('community-post-detail-back'));
    await waitFor(() => expect(screen.getByText('社区精选')).toBeTruthy());
    expect(screen.getByText('测试发帖标题')).toBeTruthy();
  });
});

function flattenText(node: { props?: { children?: React.ReactNode } } | null) {
  if (!node?.props) {
    return '';
  }

  return flattenChildren(node.props.children);
}

function flattenChildren(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(flattenChildren).join('');
  }

  if (React.isValidElement(children)) {
    return flattenChildren((children.props as { children?: React.ReactNode }).children);
  }

  return '';
}
