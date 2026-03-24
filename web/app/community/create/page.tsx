import Link from 'next/link';

import CommunityCreatePostClient from '../../../components/community/CommunityCreatePostClient';

export default function CommunityCreatePage() {
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
          <Link className="forum-nav-link forum-nav-link-active" href="/community/create">
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
          <span>发布帖子</span>
        </div>
      </div>

      <section className="forum-content">
        <div className="forum-secondary-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>发布帖子</h2>
            </div>

            <CommunityCreatePostClient />
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>发帖建议</h2>
            </div>
            <div className="forum-side-list">
              <div className="forum-side-item">
                <strong>先写一个明确标题</strong>
                <p>让用户一眼知道你是在分享技巧、求助还是展示作品。</p>
              </div>
              <div className="forum-side-item">
                <strong>正文尽量有过程感</strong>
                <p>比起只给结果图，更建议写出调整逻辑、尝试和结论。</p>
              </div>
              <div className="forum-side-item">
                <strong>图片会直接上传到社区后端</strong>
                <p>上传成功后，Web 和移动端都会看到同一组帖子图片与内容。</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
