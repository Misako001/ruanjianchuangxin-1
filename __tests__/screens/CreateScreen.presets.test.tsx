import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {CreateScreen} from '../../src/screens/CreateScreen';

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    Canvas: ({children, ...props}: any) => <View {...props}>{children}</View>,
    ColorMatrix: ({children, ...props}: any) => <View {...props}>{children}</View>,
    Image: (props: any) => <View {...props} />,
    Skia: {
      Data: {
        fromBase64: jest.fn(() => ({mock: true})),
      },
      Image: {
        MakeImageFromEncoded: jest.fn(() => ({mockImage: true})),
      },
    },
  };
});

jest.mock('../../src/assets/design', () => ({
  HERO_CREATE: 1,
}));

jest.mock('../../src/components/app/PageHero', () => ({
  PageHero: 'PageHero',
}));

jest.mock('../../src/theme/canvasDesign', () => ({
  canvasText: {
    body: {},
    bodyStrong: {},
    bodyMuted: {},
    sectionTitle: {},
    caption: {},
  },
  canvasUi: {
    chip: {},
    chipActive: {},
    titleWithIcon: {},
    iconBadge: {},
    input: {},
    primaryButton: {},
    secondaryButton: {},
    dangerButton: {},
    subtleCard: {},
  },
  cardSurfaceBlue: {},
  glassShadow: {},
}));

jest.mock('../../src/hooks/useImagePicker', () => ({
  useImagePicker: jest.fn(),
}));

jest.mock('../../src/voice/imageContext', () => ({
  buildVoiceImageContext: jest.fn(() => null),
}));

jest.mock('../../src/voice/localParser', () => ({
  parseLocalVoiceCommand: jest.fn(),
}));

jest.mock('../../src/voice/speechRecognizer', () => ({
  createSpeechRecognizer: jest.fn(() => ({
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
  })),
  requestRecordAudioPermission: jest.fn(async () => true),
}));

jest.mock('../../src/modules/api', () => ({
  colorApi: {
    initialSuggest: jest.fn(async () => ({})),
    voiceTranscribe: jest.fn(async () => ({transcript: '', language: 'zh-CN'})),
    voiceRefine: jest.fn(async () => ({
      actions: [],
      confidence: 0,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: '',
      message: '',
      source: 'cloud',
    })),
    autoGrade: jest.fn(async () => ({
      globalActions: [],
      confidence: 0,
      fallbackUsed: false,
      explanation: '',
      sceneProfile: 'general',
      qualityRiskFlags: [],
    })),
    segment: jest.fn(async () => ({masks: []})),
  },
  formatApiErrorMessage: jest.fn((error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
}));

jest.mock('../../src/colorEngine/exportService', () => ({
  exportGradedResult: jest.fn(async () => ({
    uri: 'file:///tmp/exported.jpg',
    galleryUri: 'content://media/external/images/media/100',
    savedToGallery: true,
    galleryDisplayName: 'visiongenie_test.jpg',
    spec: {format: 'jpeg', quality: 0.92, sourcePolicy: 'allow_fallback'},
    warnings: [],
    exportedAt: '2026-03-31T00:00:00.000Z',
    nativeExportSucceeded: true,
    degradedExport: false,
  })),
}));

jest.mock('../../src/agent/executionContextStore', () => ({
  useAgentExecutionContextStore: jest.fn((selector: (state: any) => unknown) =>
    selector({setColorContext: jest.fn(), modelingImageContext: null}),
  ),
}));

const {useImagePicker} = jest.requireMock('../../src/hooks/useImagePicker') as {
  useImagePicker: jest.Mock;
};

const {exportGradedResult} = jest.requireMock('../../src/colorEngine/exportService') as {
  exportGradedResult: jest.Mock;
};

const stringifyNodeText = (node: any): string => {
  if (node == null) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(item => stringifyNodeText(item)).join('');
  }
  if (typeof node === 'object' && node.children) {
    return stringifyNodeText(node.children);
  }
  return '';
};

const findPressableContaining = (
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance =>
  renderer.root.find(
    node =>
      typeof node.props?.onPress === 'function' &&
      stringifyNodeText(node).replace(/\s+/g, '').includes(label.replace(/\s+/g, '')),
  );

describe('CreateScreen preset gallery', () => {
  let renderer: TestRenderer.ReactTestRenderer;

  beforeEach(async () => {
    useImagePicker.mockReturnValue({
      selectedImage: {
        success: true,
        uri: 'file:///tmp/mock.jpg',
        base64: 'ZmFrZQ==',
        type: 'image/jpeg',
        fileName: 'mock.jpg',
        width: 1200,
        height: 800,
      },
      pickFromGallery: jest.fn(),
      pickFromCamera: jest.fn(),
      clearImage: jest.fn(),
    });

    await act(async () => {
      renderer = TestRenderer.create(
        <CreateScreen capabilities={[{module: 'color', strictMode: true, provider: 'tripo'} as never]} />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    exportGradedResult.mockClear();
  });

  it('shows expanded preset choices migrated from the reference branch', async () => {
    await act(async () => {
      findPressableContaining(renderer, '预设').props.onPress();
    });

    const text = stringifyNodeText(renderer.toJSON());
    expect(text).toContain('黑金电影');
    expect(text).toContain('清透人像');
    expect(text).toContain('胶片纪实');
    expect(text).toContain('日系奶油');
    expect(text).toContain('赛博霓虹');
    expect(text).toContain('夜景通透');
  });

  it('applies a migrated preset and updates the execution summary', async () => {
    await act(async () => {
      findPressableContaining(renderer, '预设').props.onPress();
    });

    await act(async () => {
      findPressableContaining(renderer, '黑金电影').props.onPress();
    });

    const text = stringifyNodeText(renderer.toJSON());
    expect(text).toContain('已应用风格预设: 黑金电影');
    expect(text).toContain('电影 · 电影感 / 黑金');
  });

  it('keeps the preset panel open after choosing a preset for quick comparison', async () => {
    await act(async () => {
      findPressableContaining(renderer, '预设').props.onPress();
    });

    await act(async () => {
      findPressableContaining(renderer, '黑金电影').props.onPress();
    });

    const text = stringifyNodeText(renderer.toJSON());
    expect(text).toContain('风格预设');
    expect(text).toContain('日系奶油');
    expect(text).toContain('赛博霓虹');
  });

  it('saves the current preview when the save button is pressed', async () => {
    await act(async () => {
      findPressableContaining(renderer, '保存').props.onPress();
    });

    expect(exportGradedResult).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRef: expect.objectContaining({current: expect.anything()}),
        spec: expect.objectContaining({
          format: 'jpeg',
          quality: 0.92,
          sourcePolicy: 'allow_fallback',
        }),
        metadata: expect.objectContaining({
          sourceUri: 'file:///tmp/mock.jpg',
          workingSpace: 'linear_srgb',
        }),
      }),
    );
  });
});
