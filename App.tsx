import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  View,
} from 'react-native';
import { Asset, launchImageLibrary } from 'react-native-image-picker';
import AIColorTuning from './AIColorTuning';
import ThreeDModeling from './ThreeDModeling';
import {
  CommunityComment,
  CommunityFeedSort,
  LocalCreatePostInput,
} from './shared/community/contracts';
import {
  buildDemoFeedFromDetails,
  createInitialCommunityCommentsByPostId,
  createInitialCommunityPostDetails,
  createLocalComment,
  createLocalPostDetail,
} from './shared/community/demoData';
import CommunityHomeSection from './src/community/CommunityHomeSection';
import CommunityPostDetailView from './src/community/CommunityPostDetailView';

type TabKey = 'home' | 'capture' | 'ai' | 'profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [showAIColorTuning, setShowAIColorTuning] = useState(false);
  const [showThreeDModeling, setShowThreeDModeling] = useState(false);
  const [communityFeedSort, setCommunityFeedSort] =
    useState<CommunityFeedSort>('recommended');
  const [communityPostDetails, setCommunityPostDetails] = useState(() =>
    createInitialCommunityPostDetails(),
  );
  const [communityCommentsByPostId, setCommunityCommentsByPostId] = useState(() =>
    createInitialCommunityCommentsByPostId(),
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState('');
  const [draftPostTitle, setDraftPostTitle] = useState('');
  const [draftPostContent, setDraftPostContent] = useState('');
  const [draftPostImageAsset, setDraftPostImageAsset] = useState<Asset | null>(null);
  const [postFormMessage, setPostFormMessage] = useState('');

  const communityPosts = useMemo(
    () => buildDemoFeedFromDetails(communityPostDetails, communityFeedSort),
    [communityFeedSort, communityPostDetails],
  );

  const selectedPost = selectedPostId ? communityPostDetails[selectedPostId] : null;
  const selectedComments = selectedPostId
    ? communityCommentsByPostId[selectedPostId] ?? []
    : [];

  const renderHomeScreen = () => {
    if (selectedPostId && selectedPost) {
      return (
        <CommunityPostDetailView
          comments={selectedComments}
          draftComment={draftComment}
          onBack={() => {
            setSelectedPostId(null);
            setDraftComment('');
          }}
          onChangeDraftComment={setDraftComment}
          onSubmitComment={handleSubmitComment}
          onToggleFavorite={handleToggleFavorite}
          onToggleLike={handleToggleLike}
          post={selectedPost}
        />
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.homeScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Vision Genie</Text>
          <Text style={styles.subtitle}>MAGIC DISCOVERY •</Text>
        </View>

        <View style={styles.content}>
          <TouchableOpacity style={styles.card1}>
            <Text style={styles.cardTitle1}>今日 AI 艺术家</Text>
            <View style={styles.playIcon}>
              <Text style={styles.playIconText}>▶</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card2}>
            <Text style={styles.cardTitle2}>心情树洞</Text>
            <Text style={styles.cardSubtitle}>匿名倾诉, AI 暖心回应</Text>
          </TouchableOpacity>
        </View>

        <CommunityHomeSection
          currentSort={communityFeedSort}
          onChangeSort={setCommunityFeedSort}
          onPressPost={setSelectedPostId}
          posts={communityPosts}
        />
      </ScrollView>
    );
  };

  const renderCaptureScreen = () => (
    <View style={styles.captureContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Magic</Text>
        <Text style={styles.subtitle}>STUDIO MODE •</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.captureCard1}
          onPress={() => setShowAIColorTuning(true)}
        >
          <Text style={styles.captureCardIcon}>🎨</Text>
          <Text style={styles.captureCardTitle}>AI 智能调色</Text>
        </TouchableOpacity>

        <View style={styles.captureCardRow}>
          <TouchableOpacity
            style={styles.captureCard2}
            onPress={() => setShowThreeDModeling(true)}
          >
            <Text style={styles.captureCardIcon}>📦</Text>
            <Text style={styles.captureCardTitle}>3D 建模</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureCard3}>
            <Text style={styles.captureCardIcon}>🎬</Text>
            <Text style={styles.captureCardTitle}>视频调色</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderProfileScreen = () => (
    <ScrollView
      contentContainerStyle={styles.profileScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>我的</Text>
        <Text style={styles.subtitle}>COMMUNITY CREATOR •</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>VG</Text>
        </View>
        <Text style={styles.profileName}>个人信息展示预留区</Text>
        <Text style={styles.profileBio}>
          后续可在这里接入头像、昵称、简介、收藏、浏览历史和社区统计。
        </Text>
        <View style={styles.profilePlaceholderRow}>
          <View style={styles.profilePlaceholderBox}>
            <Text style={styles.profilePlaceholderLabel}>我的帖子</Text>
          </View>
          <View style={styles.profilePlaceholderBox}>
            <Text style={styles.profilePlaceholderLabel}>我的收藏</Text>
          </View>
          <View style={styles.profilePlaceholderBox}>
            <Text style={styles.profilePlaceholderLabel}>历史记录</Text>
          </View>
        </View>
      </View>

      <View style={styles.postComposerCard}>
        <Text style={styles.postComposerTitle}>发布社区帖子</Text>
        <Text style={styles.postComposerHint}>
          发布后会同步显示在首页社区帖子流，并可直接进入详情浏览。
        </Text>

        <TextInput
          placeholder="输入帖子标题"
          placeholderTextColor="rgba(255, 255, 255, 0.6)"
          style={styles.input}
          testID="create-post-title-input"
          value={draftPostTitle}
          onChangeText={text => {
            setDraftPostTitle(text);
            if (postFormMessage) {
              setPostFormMessage('');
            }
          }}
        />

        <TextInput
          multiline
          placeholder="分享你的灵感、技巧或作品故事"
          placeholderTextColor="rgba(255, 255, 255, 0.6)"
          style={[styles.input, styles.textArea]}
          testID="create-post-content-input"
          textAlignVertical="top"
          value={draftPostContent}
          onChangeText={text => {
            setDraftPostContent(text);
            if (postFormMessage) {
              setPostFormMessage('');
            }
          }}
        />

        <TouchableOpacity
          style={styles.imagePickerButton}
          testID="create-post-image-select"
          onPress={handlePickPostImage}
        >
          <Text style={styles.imagePickerButtonText}>
            {draftPostImageAsset?.uri ? '重新选择图片' : '从相册选择图片'}
          </Text>
        </TouchableOpacity>

        {draftPostImageAsset?.uri ? (
          <View style={styles.selectedImageCard}>
            <Image
              source={{ uri: draftPostImageAsset.uri }}
              style={styles.selectedImagePreview}
              testID="create-post-image-preview"
            />
            <View style={styles.selectedImageMeta}>
              <Text style={styles.selectedImageName}>
                {draftPostImageAsset.fileName || '已选择图片'}
              </Text>
              <Text style={styles.selectedImageSubtext}>
                {draftPostImageAsset.fileSize
                  ? `${Math.max(
                      1,
                      Math.round(draftPostImageAsset.fileSize / 1024),
                    )} KB`
                  : '本地图片'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removeImageButton}
              testID="create-post-image-remove"
              onPress={() => setDraftPostImageAsset(null)}
            >
              <Text style={styles.removeImageButtonText}>移除</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.imagePickerHint}>
            系统会打开手机相册选择图片，选中的图片会随帖子一起展示。
          </Text>
        )}

        {postFormMessage ? (
          <Text style={styles.postFormMessage}>{postFormMessage}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.publishButton}
          testID="create-post-submit"
          onPress={handleSubmitPost}
        >
          <Text style={styles.publishButtonText}>发布帖子</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  function handleToggleLike() {
    if (!selectedPostId) {
      return;
    }

    setCommunityPostDetails(previous => {
      const current = previous[selectedPostId];
      if (!current) {
        return previous;
      }

      const nextLiked = !current.viewerContext.liked;
      const nextLikeCount = Math.max(
        0,
        current.stats.likeCount + (nextLiked ? 1 : -1),
      );

      return {
        ...previous,
        [selectedPostId]: {
          ...current,
          stats: {
            ...current.stats,
            likeCount: nextLikeCount,
          },
          viewerContext: {
            ...current.viewerContext,
            liked: nextLiked,
          },
        },
      };
    });
  }

  function handleToggleFavorite() {
    if (!selectedPostId) {
      return;
    }

    setCommunityPostDetails(previous => {
      const current = previous[selectedPostId];
      if (!current) {
        return previous;
      }

      const nextFavorited = !current.viewerContext.favorited;
      const nextFavoriteCount = Math.max(
        0,
        current.stats.favoriteCount + (nextFavorited ? 1 : -1),
      );

      return {
        ...previous,
        [selectedPostId]: {
          ...current,
          stats: {
            ...current.stats,
            favoriteCount: nextFavoriteCount,
          },
          viewerContext: {
            ...current.viewerContext,
            favorited: nextFavorited,
          },
        },
      };
    });
  }

  function handleSubmitComment() {
    if (!selectedPostId) {
      return;
    }

    const nextContent = draftComment.trim();
    if (!nextContent) {
      return;
    }

    const nextComment: CommunityComment = createLocalComment({
      content: nextContent,
      postId: selectedPostId,
    });

    setCommunityCommentsByPostId(previous => ({
      ...previous,
      [selectedPostId]: [...(previous[selectedPostId] ?? []), nextComment],
    }));

    setCommunityPostDetails(previous => {
      const current = previous[selectedPostId];
      if (!current) {
        return previous;
      }

      return {
        ...previous,
        [selectedPostId]: {
          ...current,
          stats: {
            ...current.stats,
            commentCount: current.stats.commentCount + 1,
          },
        },
      };
    });

    setDraftComment('');
  }

  function handleSubmitPost() {
    const nextTitle = draftPostTitle.trim();
    const nextContent = draftPostContent.trim();
    if (!nextTitle || !nextContent) {
      setPostFormMessage('标题和正文需要填写完整后才能发布。');
      return;
    }

    const postInput: LocalCreatePostInput = {
      content: nextContent,
      imageUrl: draftPostImageAsset?.uri,
      title: nextTitle,
    };

    const nextPost = createLocalPostDetail(postInput);

    setCommunityPostDetails(previous => ({
      [nextPost.id]: nextPost,
      ...previous,
    }));

    setCommunityCommentsByPostId(previous => ({
      ...previous,
      [nextPost.id]: [],
    }));

    setDraftPostTitle('');
    setDraftPostContent('');
    setDraftPostImageAsset(null);
    setPostFormMessage('帖子已发布，正在打开详情预览。');
    setCommunityFeedSort('latest');
    setActiveTab('home');
    setSelectedPostId(nextPost.id);
    setDraftComment('');
  }

  async function handlePickPostImage() {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });

      if (result.didCancel) {
        return;
      }

      const nextAsset = result.assets?.[0];
      if (!nextAsset?.uri) {
        setPostFormMessage('图片选择失败，请重新尝试。');
        return;
      }

      setDraftPostImageAsset(nextAsset);
      setPostFormMessage('');
    } catch (error) {
      setPostFormMessage('打开相册失败，请检查设备权限后重试。');
      Alert.alert('打开相册失败', '请检查设备权限或稍后重试。');
    }
  }

  return (
    <View style={styles.screen}>
      {showAIColorTuning ? (
        <AIColorTuning onBack={() => setShowAIColorTuning(false)} />
      ) : showThreeDModeling ? (
        <ThreeDModeling onBack={() => setShowThreeDModeling(false)} />
      ) : (
        <>
          {activeTab === 'home' && renderHomeScreen()}
          {activeTab === 'capture' && renderCaptureScreen()}
          {activeTab === 'ai' && (
            <View style={styles.container}>
              <View style={styles.header}>
                <Text style={styles.title}>AI 助手</Text>
              </View>
            </View>
          )}
          {activeTab === 'profile' && renderProfileScreen()}

          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'home' && styles.activeTabItem]}
              onPress={() => setActiveTab('home')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>🏠</Text>
              </View>
              <Text
                style={[styles.tabText, activeTab === 'home' && styles.activeTabText]}
              >
                首页
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'capture' && styles.activeTabItem,
              ]}
              onPress={() => setActiveTab('capture')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>📷</Text>
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'capture' && styles.activeTabText,
                ]}
              >
                拍照
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'ai' && styles.activeTabItem]}
              onPress={() => setActiveTab('ai')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>✨</Text>
              </View>
              <Text
                style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}
              >
                AI助手
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'profile' && styles.activeTabItem,
              ]}
              onPress={() => setActiveTab('profile')}
            >
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>👤</Text>
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'profile' && styles.activeTabText,
                ]}
              >
                我的
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#6a11cb',
  },
  container: {
    flex: 1,
    backgroundColor: '#6a11cb',
  },
  captureContainer: {
    flex: 1,
    backgroundColor: '#1a365d',
  },
  header: {
    paddingTop: 50,
    paddingLeft: 30,
    paddingBottom: 24,
    paddingRight: 30,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
  },
  homeScrollContent: {
    paddingBottom: 32,
  },
  profileScrollContent: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 30,
  },
  card1: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card2: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 24,
  },
  cardTitle1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  cardTitle2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
  },
  playIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconText: {
    color: '#6a11cb',
    fontSize: 16,
    fontWeight: 'bold',
  },
  captureCard1: {
    backgroundColor: '#ff4d4d',
    borderRadius: 20,
    padding: 40,
    marginBottom: 20,
    alignItems: 'center',
  },
  captureCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  captureCard2: {
    backgroundColor: '#4dd0e1',
    borderRadius: 20,
    padding: 30,
    width: '48%',
    alignItems: 'center',
  },
  captureCard3: {
    backgroundColor: '#ffeb3b',
    borderRadius: 20,
    padding: 30,
    width: '48%',
    alignItems: 'center',
  },
  captureCardIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  captureCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  profileCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  profileAvatarText: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
  },
  profileName: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
  },
  profileBio: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  profilePlaceholderRow: {
    flexDirection: 'row',
    marginTop: 18,
    justifyContent: 'space-between',
  },
  profilePlaceholderBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  profilePlaceholderLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  postComposerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  postComposerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
  },
  postComposerHint: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 18,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    color: 'white',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
  },
  textArea: {
    minHeight: 130,
  },
  postFormMessage: {
    color: '#ffeb3b',
    fontSize: 13,
    marginBottom: 14,
  },
  imagePickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  imagePickerButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  imagePickerHint: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  selectedImageCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedImagePreview: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  selectedImageMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  selectedImageName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedImageSubtext: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    marginTop: 6,
  },
  removeImageButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeImageButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  publishButton: {
    backgroundColor: '#ff8a5b',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  publishButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  tabItem: {
    alignItems: 'center',
  },
  activeTabItem: {},
  tabIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconText: {
    fontSize: 20,
  },
  tabText: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
  },
  activeTabText: {
    color: '#ffeb3b',
  },
});
