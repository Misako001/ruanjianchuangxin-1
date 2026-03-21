import Link from 'next/link';

import {
  formatPublishDate,
  getCommunityFeed,
  getFavoritePosts,
  getMyProfile,
} from '../../lib/community';

export default async function CommunityPage() {
  const [recommendedFeed, latestFeed, profile, favorites] = await Promise.all([
    getCommunityFeed('recommended'),
    getCommunityFeed('latest'),
    getMyProfile(),
    getFavoritePosts(),
  ]);

  const headlinePost = recommendedFeed.items[0];
  const headlineList = recommendedFeed.items.slice(1, 6);
  const topicPosts = latestFeed.items.slice(0, 3);

  return (
    <main className="forum-page">
      <div className="forum-topline">
        <div className="forum-topline-inner">
          <div className="forum-topline-links">
            <Link href="/">设为首页</Link>
            <span>/</span>
            <Link href="/community">收藏本站</Link>
            <span>/</span>
            <Link href="/community/create">发帖交流</Link>
            <span>/</span>
            <Link href="/community/me">创作者中心</Link>
          </div>
          <div className="forum-topline-links">
            <Link href="/login">登录</Link>
            <span>/</span>
            <Link href="/login">立即注册</Link>
            <span>/</span>
            <Link href="/community">找回密码</Link>
          </div>
        </div>
      </div>

      <section className="forum-header">
        <div className="forum-header-inner">
          <div className="forum-logo-area">
            <div className="forum-logo-mark">VG</div>
            <div className="forum-logo-copy">
              <span className="forum-domain">visiongenie community</span>
              <strong>VisionGenie 创作社区</strong>
              <p>分享 AI 视觉创作、调色、建模与灵感实践</p>
            </div>
          </div>

          <div className="forum-search-area">
            <div className="forum-search-box">
              <input placeholder="请输入搜索内容" readOnly value="" />
              <button type="button">搜索</button>
            </div>
            <div className="forum-hot-tags">
              <strong>热搜:</strong>
              <span>夜景调色</span>
              <span>3D 建模</span>
              <span>灵感板</span>
              <span>作品展示</span>
              <span>工作流</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="forum-nav">
        <div className="forum-nav-inner">
          <Link className="forum-nav-link forum-nav-link-active" href="/community">
            首页
          </Link>
          <Link className="forum-nav-link" href="/community/create">
            发帖
          </Link>
          <Link className="forum-nav-link" href="/community/me">
            创作者中心
          </Link>
          <Link className="forum-nav-link" href="/login">
            登录入口
          </Link>
        </div>
      </nav>

      <div className="forum-breadcrumb">
        <div className="forum-breadcrumb-inner">
          <span>首页</span>
          <span>&gt;</span>
          <span>导航</span>
        </div>
      </div>

      <section className="forum-content">
        <div className="forum-main-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>精华帖子</h2>
            </div>

            <div className="forum-featured-layout">
              <article className="forum-featured-card">
                {headlinePost?.images[0] ? (
                  <div
                    className="forum-featured-image"
                    style={{ backgroundImage: `url(${headlinePost.images[0].url})` }}
                  />
                ) : (
                  <div className="forum-featured-image forum-featured-image-fallback">
                    <span>{headlinePost?.author.avatarText ?? 'VG'}</span>
                  </div>
                )}
                <div className="forum-featured-overlay">
                  <h3>{headlinePost?.title ?? '社区焦点内容'}</h3>
                  <div className="forum-featured-meta">
                    <span>{headlinePost?.author.name ?? profile.displayName}</span>
                    <span>{headlinePost ? formatPublishDate(headlinePost.publishedAt) : '刚刚'}</span>
                  </div>
                </div>
              </article>

              <div className="forum-headline-list">
                {headlineList.map(post => (
                  <Link key={post.id} className="forum-headline-item" href={`/community/post/${post.id}`}>
                    <h3>{post.title}</h3>
                    <p>{post.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <aside className="forum-board forum-board-side">
            <div className="forum-board-title">
              <h2>精选专题</h2>
            </div>

            <div className="forum-topic-list">
              {topicPosts.map(post => (
                <Link key={post.id} className="forum-topic-item" href={`/community/post/${post.id}`}>
                  {post.images[0] ? (
                    <div
                      className="forum-topic-image"
                      style={{ backgroundImage: `url(${post.images[0].url})` }}
                    />
                  ) : (
                    <div className="forum-topic-image forum-topic-image-fallback">
                      <span>{post.author.avatarText}</span>
                    </div>
                  )}
                  <strong>{post.title}</strong>
                </Link>
              ))}
            </div>
          </aside>
        </div>

        <div className="forum-secondary-grid">
          <section className="forum-board">
            <div className="forum-board-title">
              <h2>最新帖子</h2>
            </div>
            <div className="forum-thread-list">
              {latestFeed.items.slice(0, 8).map(post => (
                <Link key={post.id} className="forum-thread-item" href={`/community/post/${post.id}`}>
                  <div className="forum-thread-main">
                    <h3>{post.title}</h3>
                    <p>{post.summary}</p>
                  </div>
                  <div className="forum-thread-meta">
                    <span>{post.author.name}</span>
                    <span>{formatPublishDate(post.publishedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>社区数据</h2>
            </div>
            <div className="forum-stat-grid">
              <div className="forum-stat-box">
                <strong>{recommendedFeed.items.length}</strong>
                <span>精华帖</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.postCount}</strong>
                <span>我的帖子</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.commentCount}</strong>
                <span>我的评论</span>
              </div>
              <div className="forum-stat-box">
                <strong>{favorites.length}</strong>
                <span>我的收藏</span>
              </div>
            </div>
            <div className="forum-profile-card">
              <h3>{profile.displayName}</h3>
              <p>@{profile.handle}</p>
              <p>{profile.bio}</p>
              <div className="forum-profile-actions">
                <Link className="forum-action-button forum-action-primary" href="/community/create">
                  发布帖子
                </Link>
                <Link className="forum-action-button" href="/community/me">
                  进入主页
                </Link>
              </div>
            </div>
          </aside>
        </div>

        <div className="forum-footer-bar">
          <span>今日: {latestFeed.items.length}</span>
          <span>|</span>
          <span>帖子: {recommendedFeed.items.length + latestFeed.items.length}</span>
          <span>|</span>
          <span>会员: 15998</span>
          <span>|</span>
          <span>欢迎新会员: {profile.displayName}</span>
        </div>
      </section>
    </main>
  );
}
