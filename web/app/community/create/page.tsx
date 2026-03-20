import Link from 'next/link';

import { communityApiPaths } from '../../../../shared/community/contracts';

export default function CommunityCreatePage() {
  return (
    <main className="page-shell">
      <section className="panel">
        <h1>发布帖子</h1>
        <p style={{ color: '#5d6470', lineHeight: 1.7 }}>
          这里先把 Web 发帖的表单和 API 契约落位。正式联调时，表单会提交到
          {` ${communityApiPaths.posts}`}，图片走
          {` ${communityApiPaths.uploads}`}。
        </p>
        <form className="create-form">
          <input placeholder="例如：最近在做角色材质时踩过的坑" />
          <textarea placeholder="写下创作经验、问题、失败尝试或你的社区观点" />
          <input placeholder="https://images.visiongenie.local/demo-cover.jpg" />
          <div className="action-row">
            <button className="primary-link" type="button">
              发布演示帖子
            </button>
            <Link className="secondary-link" href="/community">
              返回社区首页
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
