import Link from 'next/link';

import {
  formatPublishDate,
  getFavoritePosts,
  getMyPosts,
  getMyProfile,
} from '../../../lib/community';

export default async function CommunityMePage() {
  const [profile, myPosts, favorites] = await Promise.all([
    getMyProfile(),
    getMyPosts(),
    getFavoritePosts(),
  ]);

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
            </div>
          </div>
        </div>
      </section>

      <nav className="forum-nav">
        <div className="forum-nav-inner">
          <Link className="forum-nav-link" href="/community">
            首页
          </Link>
          <Link className="forum-nav-link" href="/community/create">
            发帖
          </Link>
          <Link className="forum-nav-link forum-nav-link-active" href="/community/me">
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
          <span>创作者中心</span>
        </div>
      </div>

      <section className="forum-content">
        <div className="forum-secondary-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>{profile.displayName}</h2>
            </div>
            <div className="forum-profile-summary">
              <p>
                @{profile.handle} · {profile.roleLabel} · {profile.city}
              </p>
              <p>{profile.bio}</p>
            </div>
            <div className="forum-stat-grid forum-stat-grid-wide">
              <div className="forum-stat-box">
                <strong>{profile.stats.postCount}</strong>
                <span>帖子</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.commentCount}</strong>
                <span>评论</span>
              </div>
              <div className="forum-stat-box">
                <strong>{profile.stats.favoriteCount}</strong>
                <span>收藏</span>
              </div>
            </div>

            <div className="forum-subsection-title">我的帖子</div>
            <div className="forum-thread-list">
              {myPosts.length > 0 ? (
                myPosts.map(post => (
                  <Link key={post.id} className="forum-thread-item" href={`/community/post/${post.id}`}>
                    <div className="forum-thread-main">
                      <h3>{post.title}</h3>
                      <p>{post.summary}</p>
                    </div>
                    <div className="forum-thread-meta">
                      <span>{formatPublishDate(post.publishedAt)}</span>
                      <span>{post.stats.commentCount} 条评论</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>当前还没有 Web 侧可见的个人帖子</strong>
                  <span>你可以先去发布页写一篇新内容，后面接真实接口后这里会自动出现。</span>
                </div>
              )}
            </div>
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>我的收藏</h2>
            </div>
            <div className="forum-side-list">
              {favorites.length > 0 ? (
                favorites.map(post => (
                  <Link key={post.id} className="forum-side-item forum-side-link" href={`/community/post/${post.id}`}>
                    <strong>{post.title}</strong>
                    <p>{post.author.name} · {post.stats.favoriteCount} 收藏</p>
                  </Link>
                ))
              ) : (
                <div className="forum-empty-state">
                  <strong>还没有收藏内容</strong>
                  <span>等真实收藏功能接到 Web 端后，这里会显示你标记过的帖子。</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
