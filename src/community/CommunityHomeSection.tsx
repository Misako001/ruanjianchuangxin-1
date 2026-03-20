import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { CommunityPostSummary } from '../../shared/community/contracts';
import {
  demoFeed,
  demoRecommendedIds,
} from '../../shared/community/demoData';

type FeedSort = 'recommended' | 'latest' | 'hot';

export function CommunityHomeSection() {
  const [feedSort, setFeedSort] = useState<FeedSort>('recommended');

  const feed = useMemo(() => {
    if (feedSort === 'latest') {
      return [...demoFeed].sort((left, right) =>
        right.publishedAt.localeCompare(left.publishedAt),
      );
    }

    if (feedSort === 'hot') {
      return [...demoFeed].sort(
        (left, right) =>
          right.stats.likeCount +
          right.stats.commentCount * 2 -
          (left.stats.likeCount + left.stats.commentCount * 2),
      );
    }

    return [...demoRecommendedIds]
      .map(id => demoFeed.find(post => post.id === id))
      .filter(Boolean) as CommunityPostSummary[];
  }, [feedSort]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerCard}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.eyebrow}>Home Community Section</Text>
          <Text style={styles.title}>首页社区动态区块</Text>
          <Text style={styles.description}>
            这里是为后续整合预留的首页社区模块。根 App 继续保持原始壳，社区帖子流以独立区块形式接入首页。
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>可独立搬运</Text>
        </View>
      </View>

      <View style={styles.segmentedControl}>
        {(['recommended', 'latest', 'hot'] as FeedSort[]).map(sort => {
          const isActive = sort === feedSort;

          return (
            <Pressable
              key={sort}
              onPress={() => setFeedSort(sort)}
              style={[
                styles.segmentButton,
                isActive ? styles.segmentButtonActive : null,
              ]}>
              <Text
                style={[
                  styles.segmentButtonText,
                  isActive ? styles.segmentButtonTextActive : null,
                ]}>
                {sort === 'recommended'
                  ? '推荐'
                  : sort === 'latest'
                    ? '最新'
                    : '热门'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>首页可见帖子</Text>
          <Text style={styles.summaryValue}>{feed.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>当前最热点赞</Text>
          <Text style={styles.summaryValue}>{feed[0]?.stats.likeCount ?? 0}</Text>
        </View>
      </View>

      {feed.map(post => (
        <View key={post.id} style={styles.postCard}>
          <View style={styles.postHeaderRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{post.author.displayName[0]}</Text>
            </View>
            <View style={styles.postHeaderText}>
              <Text style={styles.postAuthorName}>{post.author.displayName}</Text>
              <Text style={styles.postTimestamp}>{formatDate(post.publishedAt)}</Text>
            </View>
            <View style={styles.scopeBadge}>
              <Text style={styles.scopeBadgeText}>首页社区</Text>
            </View>
          </View>

          <Text style={styles.postTitle}>{post.title}</Text>
          <Text style={styles.postExcerpt}>{post.excerpt}</Text>

          <View style={styles.statsRow}>
            <StatPill label="点赞" value={post.stats.likeCount} />
            <StatPill label="评论" value={post.stats.commentCount} />
            <StatPill label="收藏" value={post.stats.favoriteCount} />
          </View>
        </View>
      ))}
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDate(isoString: string) {
  return isoString.slice(0, 10).replaceAll('-', '.');
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 16,
  },
  headerCard: {
    borderRadius: 24,
    backgroundColor: '#1e293b',
    padding: 20,
    gap: 12,
  },
  headerTextBlock: {
    gap: 8,
  },
  eyebrow: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  description: {
    color: '#cbd5e1',
    lineHeight: 22,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#047857',
    fontWeight: '800',
    fontSize: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 20,
    backgroundColor: '#efe5d7',
    padding: 6,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#fffaf3',
  },
  segmentButtonText: {
    color: '#5d6470',
    fontWeight: '700',
  },
  segmentButtonTextActive: {
    color: '#1f2937',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#fffaf3',
    padding: 16,
  },
  summaryLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: '#172033',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 10,
  },
  postCard: {
    borderRadius: 24,
    backgroundColor: '#fffaf3',
    padding: 18,
    gap: 12,
    shadowColor: '#6b4f2b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fed7aa',
  },
  avatarText: {
    color: '#9a3412',
    fontWeight: '800',
    fontSize: 16,
  },
  postHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  postAuthorName: {
    color: '#172033',
    fontWeight: '800',
    fontSize: 15,
  },
  postTimestamp: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  scopeBadge: {
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scopeBadgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  postTitle: {
    color: '#172033',
    fontSize: 18,
    fontWeight: '800',
  },
  postExcerpt: {
    color: '#4b5563',
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  statPill: {
    borderRadius: 16,
    backgroundColor: '#f1ece4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 72,
  },
  statValue: {
    color: '#172033',
    fontWeight: '800',
    fontSize: 16,
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
});
