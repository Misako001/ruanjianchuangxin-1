import Link from 'next/link';

import { getPostDetail } from '../../../../lib/community';

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostDetail(id);

  if (!post) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h1>帖子不存在</h1>
          <p style={{ color: '#5d6470', lineHeight: 1.7 }}>
            它可能已经被删除，或者当前 API 服务还没有这条记录。
          </p>
          <Link className="secondary-link" href="/community">
            返回社区首页
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <Link className="secondary-link" href="/community">
          返回社区首页
        </Link>
        <h1>{post.title}</h1>
        <div className="meta-row">
          <span>{post.author.displayName}</span>
          <span>{post.publishedAt.slice(0, 10)}</span>
        </div>
        <p style={{ color: '#5d6470', lineHeight: 1.8 }}>{post.content}</p>
        <div className="pill-row">
          <span className="pill">{post.stats.likeCount} 赞</span>
          <span className="pill">{post.stats.commentCount} 评论</span>
          <span className="pill">{post.stats.favoriteCount} 收藏</span>
        </div>
      </section>
    </main>
  );
}
