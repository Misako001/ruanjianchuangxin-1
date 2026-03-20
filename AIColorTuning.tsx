import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function AIColorTuning({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>返回</Text>
      </TouchableOpacity>
      <Text style={styles.title}>AI 智能调色</Text>
      <Text style={styles.description}>
        这里是 AI 调色功能占位页，后续可以和协作者的完整功能模块直接对接。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a365d',
    padding: 24,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '700',
  },
  title: {
    color: 'white',
    fontSize: 34,
    fontWeight: '800',
  },
  description: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 22,
    fontSize: 15,
  },
});
