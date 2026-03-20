import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import AIColorTuning from './AIColorTuning';
import ThreeDModeling from './ThreeDModeling';
import { CommunityHomeSection } from './src/community/CommunityHomeSection';
import { communityApiPaths } from './shared/community/contracts';
import { demoMyProfile } from './shared/community/demoData';

type AppTab = 'home' | 'capture' | 'ai' | 'profile';
type DraftPostState = {
  title: string;
  content: string;
  imageUrl: string;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [showAIColorTuning, setShowAIColorTuning] = useState(false);
  const [showThreeDModeling, setShowThreeDModeling] = useState(false);
  const [draftPost, setDraftPost] = useState<DraftPostState>({
    title: '',
    content: '',
    imageUrl: '',
  });

  const renderHomeScreen = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vision Genie</Text>
        <Text style={styles.subtitle}>MAGIC DISCOVERY •</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.homeScrollContent}
        showsVerticalScrollIndicator={false}>
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

        <CommunityHomeSection />
      </ScrollView>
    </View>
  );

  const renderCaptureScreen = () => (
    <View style={styles.captureContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Magic</Text>
        <Text style={styles.subtitle}>STUDIO MODE •</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.captureCard1}
          onPress={() => setShowAIColorTuning(true)}>
          <Text style={styles.captureCardIcon}>🎨</Text>
          <Text style={styles.captureCardTitle}>AI 智能调色</Text>
        </TouchableOpacity>

        <View style={styles.captureCardRow}>
          <TouchableOpacity
            style={styles.captureCard2}
            onPress={() => setShowThreeDModeling(true)}>
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

  const renderProfileScreen = () => {
    const isDraftReady =
      draftPost.title.trim().length > 0 && draftPost.content.trim().length > 0;

    return (
      <View style={styles.profileContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>我的</Text>
          <Text style={styles.subtitle}>PROFILE & COMMUNITY •</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.profileScrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.profileHeroCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {demoMyProfile.displayName[0]}
              </Text>
            </View>
            <View style={styles.profileHeroTextBlock}>
              <Text style={styles.profileName}>{demoMyProfile.displayName}</Text>
              <Text style={styles.profileHandle}>@{demoMyProfile.handle}</Text>
              <Text style={styles.profileBio}>
                这里预留给完整 App 的个人资料区，后续可以接昵称、头像、简介、关注数、
                作品数和社区统计。
              </Text>
            </View>
          </View>

          <View style={styles.profilePlaceholderCard}>
            <Text style={styles.sectionLabel}>个人信息展示预留区</Text>
            <Text style={styles.placeholderTitle}>资料卡、历史记录、收藏入口</Text>
            <Text style={styles.placeholderDescription}>
              这块区域先保留布局空间，后面你们和协作者整合时可以继续塞入账号信息、
              用户设置、收藏列表或个人作品集。
            </Text>
          </View>

          <View style={styles.composerCard}>
            <Text style={styles.sectionLabel}>我的社区发帖</Text>
            <Text style={styles.composerTitle}>把发帖入口收进“我的”</Text>
            <Text style={styles.placeholderDescription}>
              当前先把发帖表单封装进个人中心，后续发布时直接对接
              {` ${communityApiPaths.posts}`} 即可。
            </Text>

            <TextInput
              placeholder="帖子标题"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.input}
              value={draftPost.title}
              onChangeText={title =>
                setDraftPost(current => ({
                  ...current,
                  title,
                }))
              }
            />
            <TextInput
              multiline
              placeholder="写下你想发布到社区的内容"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={[styles.input, styles.textArea]}
              value={draftPost.content}
              onChangeText={content =>
                setDraftPost(current => ({
                  ...current,
                  content,
                }))
              }
            />
            <TextInput
              placeholder="图片 URL（预留上传入口）"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.input}
              value={draftPost.imageUrl}
              onChangeText={imageUrl =>
                setDraftPost(current => ({
                  ...current,
                  imageUrl,
                }))
              }
            />

            <TouchableOpacity
              style={[
                styles.publishButton,
                !isDraftReady && styles.publishButtonDisabled,
              ]}
              disabled={!isDraftReady}
              onPress={() =>
                setDraftPost({
                  title: '',
                  content: '',
                  imageUrl: '',
                })
              }>
              <Text style={styles.publishButtonText}>发布演示帖子</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
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
              style={[
                styles.tabItem,
                activeTab === 'home' && styles.activeTabItem,
              ]}
              onPress={() => setActiveTab('home')}>
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>🏠</Text>
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'home' && styles.activeTabText,
                ]}>
                首页
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'capture' && styles.activeTabItem,
              ]}
              onPress={() => setActiveTab('capture')}>
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>📷</Text>
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'capture' && styles.activeTabText,
                ]}>
                拍照
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'ai' && styles.activeTabItem,
              ]}
              onPress={() => setActiveTab('ai')}>
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>✨</Text>
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'ai' && styles.activeTabText,
                ]}>
                AI助手
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'profile' && styles.activeTabItem,
              ]}
              onPress={() => setActiveTab('profile')}>
              <View style={styles.tabIcon}>
                <Text style={styles.tabIconText}>👤</Text>
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'profile' && styles.activeTabText,
                ]}>
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
  container: {
    flex: 1,
    backgroundColor: '#6a11cb',
  },
  captureContainer: {
    flex: 1,
    backgroundColor: '#1a365d',
  },
  profileContainer: {
    flex: 1,
    backgroundColor: '#34206b',
  },
  header: {
    paddingTop: 50,
    paddingLeft: 30,
    paddingBottom: 30,
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
    paddingBottom: 28,
  },
  profileScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 18,
  },
  content: {
    paddingHorizontal: 30,
    justifyContent: 'center',
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
    marginBottom: 12,
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
  profileHeroCard: {
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.14)',
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffeb3b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: '#34206b',
    fontSize: 28,
    fontWeight: '800',
  },
  profileHeroTextBlock: {
    flex: 1,
  },
  profileName: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
  },
  profileHandle: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    fontSize: 13,
  },
  profileBio: {
    color: 'rgba(255,255,255,0.82)',
    marginTop: 10,
    lineHeight: 20,
    fontSize: 14,
  },
  profilePlaceholderCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
  },
  composerCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    padding: 20,
  },
  sectionLabel: {
    color: '#ffeb3b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  placeholderTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  composerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  placeholderDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  input: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: 'white',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 14,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  publishButton: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#ffeb3b',
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishButtonDisabled: {
    backgroundColor: 'rgba(255,235,59,0.45)',
  },
  publishButtonText: {
    color: '#34206b',
    fontWeight: '800',
    fontSize: 15,
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
