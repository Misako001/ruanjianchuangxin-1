/**
 * @format
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import App from '../App';
import { launchImageLibrary } from 'react-native-image-picker';

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

describe('App community flow', () => {
  it('renders homepage posts and supports detail interactions', () => {
    const screen = render(<App />);

    expect(screen.getByTestId('community-post-card-post-01')).toBeTruthy();

    fireEvent.press(screen.getByTestId('community-post-card-post-01'));

    expect(screen.getByText('返回首页')).toBeTruthy();
    expect(flattenText(screen.getByTestId('community-post-detail-like'))).toContain(
      '点赞 18',
    );

    fireEvent.press(screen.getByTestId('community-post-detail-like'));
    expect(flattenText(screen.getByTestId('community-post-detail-like'))).toContain(
      '已点赞 19',
    );

    fireEvent.press(screen.getByTestId('community-post-detail-favorite'));
    expect(
      flattenText(screen.getByTestId('community-post-detail-favorite')),
    ).toContain('已收藏 7');

    fireEvent.changeText(
      screen.getByTestId('community-post-detail-comment-input'),
      '这条评论来自测试',
    );
    fireEvent.press(screen.getByTestId('community-post-detail-comment-submit'));

    expect(screen.getByText('这条评论来自测试')).toBeTruthy();

    fireEvent.press(screen.getByTestId('community-post-detail-back'));
    expect(screen.getByTestId('community-post-card-post-01')).toBeTruthy();
  });

  it('creates a post from profile and opens the new detail view', async () => {
    const screen = render(<App />);

    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [
        {
          fileName: 'test-post.png',
          fileSize: 10240,
          uri: 'content://test-post.png',
        },
      ],
      didCancel: false,
    });

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

    expect(screen.getByText('测试发帖标题')).toBeTruthy();
    expect(screen.getByText('这是一个用于验证发帖流程的帖子正文。')).toBeTruthy();
    expect(screen.getByText('content://test-post.png')).toBeTruthy();

    fireEvent.press(screen.getByTestId('community-post-detail-back'));
    expect(screen.getByText('社区精选')).toBeTruthy();
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
