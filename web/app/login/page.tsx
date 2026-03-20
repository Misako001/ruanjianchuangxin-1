import Link from 'next/link';

export default function LoginPage() {
  return (
    <main className="page-shell">
      <section className="panel login-card">
        <h1>社区登录</h1>
        <p style={{ color: '#5d6470', lineHeight: 1.7 }}>
          一期会通过主账号适配器打通真正登录。当前页面先作为统一登录入口占位，方便
          App 与 Web 共用同一套社区权限模型。
        </p>
        <input defaultValue="visiongenie-main-user-01" readOnly />
        <input defaultValue="visiongenie-community-dev-token" readOnly />
        <div className="action-row">
          <Link className="primary-link" href="/community">
            用演示身份进入社区
          </Link>
          <Link className="secondary-link" href="/">
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
