import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CommunityComment,
  CommunityPostDetail,
} from '../../shared/community/contracts';

type CommunityPostDetailViewProps = {
  post: CommunityPostDetail;
  comments: CommunityComment[];
  draftComment: string;
  onChangeDraftComment: (text: string) => void;
  onDeletePost: () => void;
  onToggleLike: () => void;
  onToggleFavorite: () => void;
  onSubmitComment: () => void;
  onBack: () => void;
};

export default function CommunityPostDetailView({
  post,
  comments,
  draftComment,
  onBack,
  onChangeDraftComment,
  onDeletePost,
  onSubmitComment,
  onToggleFavorite,
  onToggleLike,
}: CommunityPostDetailViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        style={styles.backButton}
        testID="community-post-detail-back"
        onPress={onBack}
      >
        <Text style={styles.backButtonText}>返回首页</Text>
      </Pressable>

      <View style={styles.headerCard}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{post.author.avatarText}</Text>
          </View>
          <View style={styles.authorMeta}>
            <Text style={styles.author}>{post.author.name}</Text>
            <Text style={styles.time}>{formatTimestamp(post.publishedAt)}</Text>
          </View>
        </View>

        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.content}>{post.content}</Text>

        {post.viewerContext.canDelete ? (
          <Pressable
            style={styles.deleteButton}
            testID="community-post-detail-delete"
            onPress={onDeletePost}
          >
            <Text style={styles.deleteButtonText}>删除帖子</Text>
          </Pressable>
        ) : null}

        {post.images.length > 0 ? (
          <View style={styles.imagesBlock}>
            {post.images.map(image => (
              <View key={image.id} style={styles.imagePlaceholder}>
                <Image
                  source={{ uri: image.url }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
                <Text style={styles.imageLabel}>{image.alt}</Text>
                <Text style={styles.imageUrl}>{image.url}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            style={[
              styles.actionButton,
              post.viewerContext.liked && styles.actionButtonActive,
            ]}
            testID="community-post-detail-like"
            onPress={onToggleLike}
          >
            <Text style={styles.actionButtonText}>
              {post.viewerContext.liked ? '已点赞' : '点赞'} {post.stats.likeCount}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.actionButton,
              post.viewerContext.favorited && styles.actionButtonActive,
            ]}
            testID="community-post-detail-favorite"
            onPress={onToggleFavorite}
          >
            <Text style={styles.actionButtonText}>
              {post.viewerContext.favorited ? '已收藏' : '收藏'} {post.stats.favoriteCount}
            </Text>
          </Pressable>
          <View style={styles.actionInfo}>
            <Text style={styles.actionInfoText}>评论 {post.stats.commentCount}</Text>
          </View>
        </View>
      </View>

      <View style={styles.commentCard}>
        <Text style={styles.commentTitle}>评论区</Text>
        <TextInput
          multiline
          placeholder="写下你的想法"
          placeholderTextColor="rgba(255, 255, 255, 0.55)"
          style={styles.commentInput}
          testID="community-post-detail-comment-input"
          textAlignVertical="top"
          value={draftComment}
          onChangeText={onChangeDraftComment}
        />

        <Pressable
          style={styles.commentSubmit}
          testID="community-post-detail-comment-submit"
          onPress={onSubmitComment}
        >
          <Text style={styles.commentSubmitText}>发表评论</Text>
        </Pressable>

        <View style={styles.commentList}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>{comment.author.avatarText}</Text>
              </View>
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>{comment.author.name}</Text>
                <Text style={styles.commentContent}>{comment.content}</Text>
                <Text style={styles.commentTime}>{formatTimestamp(comment.publishedAt)}</Text>
              </View>
            </View>
          ))}
          {comments.length === 0 ? (
            <Text style={styles.emptyCommentText}>还没有评论，来发表第一条看法吧。</Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function formatTimestamp(isoDate: string) {
  const date = new Date(isoDate);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 28,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginBottom: 16,
  },
  backButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  headerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    padding: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
  },
  authorMeta: {
    marginLeft: 12,
  },
  author: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  time: {
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: 3,
    fontSize: 12,
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  content: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 15,
    lineHeight: 24,
    marginTop: 14,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 94, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 138, 0.28)',
  },
  deleteButtonText: {
    color: '#ffe1e1',
    fontSize: 13,
    fontWeight: '700',
  },
  imagesBlock: {
    marginTop: 18,
  },
  imagePlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  imagePreview: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  imageLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  imageUrl: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 10,
  },
  actionButtonActive: {
    backgroundColor: 'rgba(255, 235, 59, 0.22)',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  actionInfo: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionInfoText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
  },
  commentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    padding: 20,
    marginTop: 18,
  },
  commentTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  commentInput: {
    minHeight: 100,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: 'white',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 14,
  },
  commentSubmit: {
    borderRadius: 18,
    backgroundColor: '#ff8a5b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 14,
  },
  commentSubmitText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  commentList: {
    marginTop: 18,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  commentContent: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  commentTime: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    marginTop: 6,
  },
  emptyCommentText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
});
