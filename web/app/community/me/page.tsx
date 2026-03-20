import { getMyProfile } from '../../../lib/community';

export default async function CommunityMePage() {
  const profile = await getMyProfile();

  return (
    <main className="page-shell">
      <section className="panel">
        <h1>{profile.displayName}</h1>
        <p style={{ color: '#5d6470', lineHeight: 1.7 }}>@{profile.handle}</p>
        <p style={{ color: '#5d6470', lineHeight: 1.7 }}>{profile.bio}</p>
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
      </section>
    </main>
  );
}
