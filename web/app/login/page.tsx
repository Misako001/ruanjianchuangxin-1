import Link from 'next/link';

export default function LoginPage() {
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
          <Link className="forum-nav-link" href="/community/me">
            创作者中心
          </Link>
          <Link className="forum-nav-link forum-nav-link-active" href="/login">
            登录入口
          </Link>
        </div>
      </nav>

      <div className="forum-breadcrumb">
        <div className="forum-breadcrumb-inner">
          <span>首页</span>
          <span>&gt;</span>
          <span>登录入口</span>
        </div>
      </div>

      <section className="forum-content">
        <div className="forum-secondary-grid">
          <section className="forum-board forum-board-wide">
            <div className="forum-board-title">
              <h2>社区登录</h2>
            </div>
            <div className="forum-form-wrap">
              <p className="forum-board-intro">
                正式版本会通过主账号适配器接入真实登录。当前页面保留为演示入口，让
                Web 与 App 在结构上维持同一套权限模型。
              </p>

              <form className="forum-publish-form">
                <label htmlFor="account">演示账号</label>
                <input id="account" defaultValue="visiongenie-main-user-01" readOnly />

                <label htmlFor="token">演示 Token</label>
                <input id="token" defaultValue="visiongenie-community-dev-token" readOnly />

                <div className="forum-button-row">
                  <Link className="forum-action-button forum-action-primary" href="/community">
                    用演示身份进入社区
                  </Link>
                  <Link className="forum-action-button" href="/">
                    返回首页
                  </Link>
                </div>
              </form>
            </div>
          </section>

          <aside className="forum-board">
            <div className="forum-board-title">
              <h2>登录说明</h2>
            </div>
            <div className="forum-side-list">
              <div className="forum-side-item">
                <strong>当前是演示态</strong>
                <p>方便前端先完成页面、导航与联调流程。</p>
              </div>
              <div className="forum-side-item">
                <strong>后续接统一账号</strong>
                <p>App 与 Web 将共享同一套社区身份、内容与互动状态。</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
