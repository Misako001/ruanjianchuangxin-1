import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card landing-hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">VisionGenie Community</span>
            <h1>独立 Web 社区站已经进入可浏览、可演示、可继续扩展的状态。</h1>
            <p>
              Web 端会和 App 共用一套社区模型。当前重点放在浏览体验、详情阅读、创作入口和个人主页，
              后续再接统一后端、搜索、通知和治理能力。
            </p>
            <div className="hero-actions">
              <Link className="primary-link" href="/community">
                进入社区首页
              </Link>
              <Link className="secondary-link" href="/login">
                登录演示账号
              </Link>
            </div>
          </div>

          <div className="hero-spotlight">
            <span className="section-kicker">Web Preview</span>
            <h2>更像一个内容社区，而不是接口样板页</h2>
            <p>
              首页、帖子详情、发帖页、我的主页都已统一改版，方便你直接在 PC 端看效果和继续调 UI。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
