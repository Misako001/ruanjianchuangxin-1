import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ThreeDModeling({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>返回</Text>
      </TouchableOpacity>
      <Text style={styles.title}>3D 建模</Text>
      <Text style={styles.description}>
        这里是 3D 建模功能占位页，保持了你给的导航入口结构，后续整合时可以直接替换成真实业务页面。
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
