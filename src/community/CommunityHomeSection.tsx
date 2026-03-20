import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CommunityFeedSort,
  CommunityPostSummary,
} from '../../shared/community/contracts';

type CommunityHomeSectionProps = {
  posts: CommunityPostSummary[];
  currentSort: CommunityFeedSort;
  onChangeSort: (sort: CommunityFeedSort) => void;
  onPressPost: (postId: string) => void;
};

const SORT_OPTIONS: Array<{ label: string; value: CommunityFeedSort }> = [
  { label: '推荐', value: 'recommended' },
  { label: '最新', value: 'latest' },
  { label: '热门', value: 'hot' },
];

export default function CommunityHomeSection({
  posts,
  currentSort,
  onChangeSort,
  onPressPost,
}: CommunityHomeSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>社区精选</Text>
        <Text style={styles.sectionSubtitle}>在首页直接浏览社区帖子与创作灵感</Text>
      </View>

      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(option => {
          const selected = option.value === currentSort;
          return (
            <Pressable
              key={option.value}
              style={[styles.sortChip, selected && styles.sortChipActive]}
              testID={`community-sort-${option.value}`}
              onPress={() => onChangeSort(option.value)}
            >
              <Text style={[styles.sortChipText, selected && styles.sortChipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {posts.map(post => (
        <Pressable
          key={post.id}
          style={styles.card}
          testID={`community-post-card-${post.id}`}
          onPress={() => onPressPost(post.id)}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.author.avatarText}</Text>
            </View>
            <View style={styles.meta}>
              <Text style={styles.author}>{post.author.name}</Text>
              <Text style={styles.time}>{formatRelativeLabel(post.publishedAt)}</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>{post.title}</Text>
          <Text style={styles.cardSummary}>{post.summary}</Text>

          {post.images.length > 0 ? (
            <View style={styles.imageBlock}>
              <Image
                source={{ uri: post.images[0].url }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
              {post.images.length > 1 ? (
                <View style={styles.imageCountBadge}>
                  <Text style={styles.imageCountText}>+{post.images.length - 1}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <Text style={styles.statText}>点赞 {post.stats.likeCount}</Text>
            <Text style={styles.statText}>评论 {post.stats.commentCount}</Text>
            <Text style={styles.statText}>收藏 {post.stats.favoriteCount}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function formatRelativeLabel(isoDate: string) {
  const diffInHours = Math.max(
    1,
    Math.round((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60)),
  );

  if (diffInHours < 24) {
    return `${diffInHours} 小时前`;
  }

  return `${Math.round(diffInHours / 24)} 天前`;
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  sectionSubtitle: {
    marginTop: 6,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    lineHeight: 20,
  },
  sortRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  sortChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 10,
  },
  sortChipActive: {
    backgroundColor: '#ffeb3b',
  },
  sortChipText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: '#4a2c7a',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
  },
  meta: {
    marginLeft: 12,
  },
  author: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  time: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  cardTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardSummary: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 14,
    lineHeight: 21,
  },
  imageBlock: {
    marginTop: 14,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 188,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  imageCountBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  imageCountText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statText: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 13,
  },
});
