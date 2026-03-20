import Link from 'next/link';

import { getCommunityFeed, getMyProfile, summarizePostCard } from '../../lib/community';

export default async function CommunityPage() {
  const [feed, profile] = await Promise.all([getCommunityFeed(), getMyProfile()]);

  return (
    <main className="page-shell">
      <section className="hero">
        <span className="hero-tag">Community Feed</span>
        <h1>App 与 Web 共用同一条社区帖子流</h1>
        <p>
          当前页面优先展示推荐流，并且直接消费与原生端一致的字段结构：
          作者、时间、摘要、图片预览与互动计数。
        </p>
        <div className="action-row">
          <Link className="primary-link" href="/community/create">
            发布帖子
          </Link>
          <Link className="secondary-link" href="/community/me">
            我的社区主页
          </Link>
        </div>
      </section>

      <section className="community-grid">
        <div className="panel">
          <h2>推荐帖子</h2>
          {feed.items.map(post => (
            <article key={post.id} className="feed-card">
              <div className="meta-row">
                <span>{post.author.displayName}</span>
                <span>{post.publishedAt.slice(0, 10)}</span>
                <span>公开浏览</span>
              </div>
              <h3>{post.title}</h3>
              <p style={{ color: '#5d6470', lineHeight: 1.7 }}>{post.excerpt}</p>
              <div className="pill-row">
                <span className="pill">{summarizePostCard(post)}</span>
                {post.imagePreviewUrls.length > 0 ? (
                  <span className="pill">{post.imagePreviewUrls.length} 张图片</span>
                ) : null}
              </div>
              <div className="action-row" style={{ marginTop: 16 }}>
                <Link className="primary-link" href={`/community/post/${post.id}`}>
                  查看详情
                </Link>
              </div>
            </article>
          ))}
        </div>

        <aside className="panel">
          <h2>当前账号</h2>
          <p style={{ color: '#5d6470', lineHeight: 1.7 }}>
            Web 端首期按登录访问规划，后续如果改成公开浏览，只需放开守卫而不必重做
            社区数据层。
          </p>
          <div className="stat-list">
            <div className="stat-box">
              <strong>{profile.stats.postCount}</strong>
              <span>帖子</span>
            </div>
            <div className="stat-box">
              <strong>{profile.stats.commentCount}</strong>
              <span>评论</span>
            </div>
            <div className="stat-box">
              <strong>{profile.stats.favoriteCount}</strong>
              <span>收藏</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
