import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <span className="hero-tag">VisionGenie Community</span>
        <h1>独立 Web 社区站已经开始与原生 App 共用同一套社区模型</h1>
        <p>
          这个站点会和 App 端访问统一的 community-api，包括帖子流、详情、个人页、
          点赞收藏以及后续扩展的内容治理与运营页面。
        </p>
        <div className="action-row">
          <Link className="primary-link" href="/community">
            进入社区首页
          </Link>
          <Link className="secondary-link" href="/login">
            登录演示账号
          </Link>
        </div>
      </section>
    </main>
  );
}
