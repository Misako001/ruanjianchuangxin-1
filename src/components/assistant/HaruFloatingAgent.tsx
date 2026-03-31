import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {WebView} from 'react-native-webview';
import {markRuleIgnored, markRuleShown, shouldTriggerRule} from '../../assistant/frequency';
import {type FloatingAssistantTab} from '../../assistant/quickActions';
import {assistantTriggerRules} from '../../assistant/rules';
import {reduceAssistantUiState} from '../../assistant/stateMachine';
import type {
  AssistantPanelVisualConfig,
  AssistantScenePage,
  AssistantUiState,
} from '../../assistant/types';
import {useAgentExecutionContextStore} from '../../agent/executionContextStore';
import {useAppStore} from '../../store/appStore';
import {
  agentApi,
  formatApiErrorMessage,
  type AgentExecuteResponse,
  type AgentPlanAction,
  type AgentPlanResponse,
  type ModuleCapabilityItem,
} from '../../modules/api';
import {
  buildExecuteStatusPresentation,
  buildCurrentPageSummary,
  buildMissingContextHintText,
  cancelPendingAgentWorkflow,
  executeAgentPlanCycle,
  resumePendingAgentWorkflow,
  runAgentGoalCycle,
  toResultStatusText,
  toWorkflowRunStatusText,
  type AgentClientTab,
  type AgentExecutionStrategy,
  type MissingContextGuide,
} from '../../agent/dualEntryOrchestrator';
import {useAgentVoiceGoal} from '../../agent/useAgentVoiceGoal';
import {useAgentWorkflowContinuationStore} from '../../agent/workflowContinuationStore';
import {requestAgentLogin} from '../../agent/authPromptStore';
import {AGENT_PRESETS, type AgentPresetDefinition} from '../../agent/presets';

const COLLAPSED_SIZE = 64;
const PANEL_BOTTOM_OFFSET = 92;
const BUBBLE_AUTO_HIDE_MS = 2600;
const PANEL_ANIMATION_MS = 240;
const COLLAPSED_IDLE_MS = 3000;

interface HaruFloatingAgentProps {
  activeTab: FloatingAssistantTab;
  capabilities: ModuleCapabilityItem[];
  bottomInset: number;
  onNavigateTab: (tab: AgentClientTab) => void;
}

interface AssistantChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

const HIYORI_LIVE2D_PAGE_URI = 'file:///android_asset/assistant/live2d/index.html';

const PANEL_CONFIG: AssistantPanelVisualConfig = {
  avatarPersistentInExpanded: true,
  expandedLayout: {
    avatarAnchor: 'left',
    avatarRatio: 0.32,
  },
};

const AGENT_STRATEGY_OPTIONS: Array<{
  value: AgentExecutionStrategy;
  label: string;
}> = [
  {value: 'adaptive', label: '自适应'},
  {value: 'fast', label: '快速'},
  {value: 'quality', label: '质量'},
  {value: 'cost', label: '成本'},
];

const mapTabToScenePage = (tab: FloatingAssistantTab): AssistantScenePage => {
  if (tab === 'create') {
    return 'editor';
  }
  if (tab === 'agent') {
    return 'home';
  }
  return 'works';
};

const toContextJumpLabel = (guide: MissingContextGuide): string =>
  guide.targetTab === 'model' ? '去建模页补图' : '去调色页补图';

const isAgentAuthError = (error: unknown): boolean => {
  const code = String((error as {code?: unknown})?.code || '').trim().toLowerCase();
  const message = String((error as Error)?.message || '').trim().toLowerCase();
  return code === 'http_401' || code === 'unauthorized' || message.includes('unauthorized');
};

export const HaruFloatingAgent: React.FC<HaruFloatingAgentProps> = ({
  activeTab,
  capabilities,
  bottomInset,
  onNavigateTab,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapsedIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRuleIdRef = useRef('');
  const previousTabRef = useRef<FloatingAssistantTab | null>(null);
  const messageIdRef = useRef(0);
  const panStartRef = useRef({x: 0, y: 0});
  const panelAnim = useRef(new Animated.Value(0)).current;
  const collapsedIdleAnim = useRef(new Animated.Value(0)).current;
  const initialCollapsedPosition = useMemo(
    () => ({
      x: Math.max(8, windowWidth - COLLAPSED_SIZE - 8),
      y: Math.max(90, windowHeight - bottomInset - 210),
    }),
    [bottomInset, windowHeight, windowWidth],
  );
  const position = useRef(
    new Animated.ValueXY(initialCollapsedPosition),
  ).current;
  const collapsedPositionRef = useRef(initialCollapsedPosition);
  const panelPositionRef = useRef(initialCollapsedPosition);

  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const modelingImageContext = useAgentExecutionContextStore(state => state.modelingImageContext);
  const assistantFrequency = useAppStore(state => state.assistantFrequency);
  const setAssistantFrequency = useAppStore(state => state.setAssistantFrequency);

  const [, setUiState] = useState<AssistantUiState>('S1_collapsed');
  const [panelMode, setPanelMode] = useState<'hidden' | 'half' | 'full'>('hidden');
  const [bubbleText, setBubbleText] = useState('');
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [collapsedIdle, setCollapsedIdle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [live2dReady, setLive2dReady] = useState(false);
  const [live2dFailed, setLive2dFailed] = useState(false);
  const [avatarViewport, setAvatarViewport] = useState({width: 0, height: 0});
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [missingContextGuides, setMissingContextGuides] = useState<MissingContextGuide[]>([]);
  const [latestPlan, setLatestPlan] = useState<AgentPlanResponse | null>(null);
  const [latestExecuteResult, setLatestExecuteResult] = useState<AgentExecuteResponse | null>(null);
  const [latestHydratedActions, setLatestHydratedActions] = useState<AgentPlanAction[]>([]);
  const [executionStrategy, setExecutionStrategy] = useState<AgentExecutionStrategy>('adaptive');
  const [runHistory, setRunHistory] = useState<Array<{id: string; type: string; status: string; message: string}>>([]);
  const [panelPosition, setPanelPosition] = useState(initialCollapsedPosition);
  const [chatMessages, setChatMessages] = useState<AssistantChatMessage[]>([
    {
      id: 'm0',
      role: 'assistant',
      text: '你好，我是 Hiyori。你可以直接告诉我要完成什么任务。',
    },
  ]);

  const pendingActionIds = useMemo(
    () =>
      latestExecuteResult?.status === 'pending_confirm'
        ? latestExecuteResult.actionResults
            .filter(item => item.status === 'pending_confirm')
            .map(item => item.action.actionId)
        : [],
    [latestExecuteResult],
  );
  const pendingWorkflow = useAgentWorkflowContinuationStore(state => state.pendingWorkflow);
  const persistedRunRef = useAgentWorkflowContinuationStore(state => state.persistedRunRef);

  const {agentAvailable, agentAvailabilityKnown} = useMemo(() => {
    const agentCapability = capabilities.find(item => item.module === 'agent');
    if (!agentCapability) {
      return {
        // Capabilities may still be loading; avoid false-negative blocking.
        agentAvailable: capabilities.length === 0,
        agentAvailabilityKnown: capabilities.length > 0,
      };
    }
    return {
      agentAvailable: agentCapability.enabled !== false,
      agentAvailabilityKnown: true,
    };
  }, [capabilities]);

  useEffect(() => {
    if (!persistedRunRef?.runId) {
      setRunHistory([]);
      return;
    }
    let cancelled = false;
    agentApi
      .getWorkflowRunHistory(persistedRunRef.runId)
      .then(result => {
        if (!cancelled) {
          setRunHistory(result.history || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRunHistory([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [persistedRunRef?.runId]);

  const pushChatMessage = useCallback((role: AssistantChatMessage['role'], text: string) => {
    const finalText = text.trim();
    if (!finalText) {
      return;
    }
    messageIdRef.current += 1;
    setChatMessages(prev => [...prev, {id: `m${messageIdRef.current}`, role, text: finalText}]);
  }, []);

  const hideBubble = useCallback(() => {
    setBubbleVisible(false);
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
  }, []);

  const clearCollapsedIdleTimer = useCallback(() => {
    if (collapsedIdleTimerRef.current) {
      clearTimeout(collapsedIdleTimerRef.current);
      collapsedIdleTimerRef.current = null;
    }
  }, []);

  const scheduleCollapsedIdle = useCallback(() => {
    clearCollapsedIdleTimer();
    collapsedIdleTimerRef.current = setTimeout(() => {
      setCollapsedIdle(true);
    }, COLLAPSED_IDLE_MS);
  }, [clearCollapsedIdleTimer]);

  const markCollapsedActive = useCallback(() => {
    setCollapsedIdle(false);
    scheduleCollapsedIdle();
  }, [scheduleCollapsedIdle]);

  const panelSizeStyle = useMemo(() => {
    const availableHeight = Math.max(220, windowHeight - bottomInset - PANEL_BOTTOM_OFFSET - 68);
    const widthCap = Math.max(252, Math.min(windowWidth - 24, 340));
    if (panelMode === 'half') {
      return {
        width: Math.max(236, Math.min(widthCap - 18, Math.floor(windowWidth * 0.64))),
        maxHeight: Math.min(Math.max(220, Math.floor(windowHeight * 0.38)), availableHeight),
      };
    }
    return {
      width: Math.max(272, widthCap),
      maxHeight: Math.min(Math.max(300, Math.floor(windowHeight * 0.56)), availableHeight),
    };
  }, [bottomInset, panelMode, windowHeight, windowWidth]);

  const clampCollapsedPosition = useCallback(
    (next: {x: number; y: number}) => {
      const margin = 8;
      const minY = 70;
      const maxX = Math.max(margin, windowWidth - COLLAPSED_SIZE - margin);
      const maxY = Math.max(minY, windowHeight - bottomInset - 180);
      return {
        x: Math.min(maxX, Math.max(margin, next.x)),
        y: Math.min(maxY, Math.max(minY, next.y)),
      };
    },
    [bottomInset, windowHeight, windowWidth],
  );

  const clampPanelPosition = useCallback(
    (next: {x: number; y: number}) => {
      const margin = 12;
      const panelWidth = Number(panelSizeStyle.width || 300);
      const panelHeight = Number(panelSizeStyle.maxHeight || 360);
      const maxX = Math.max(margin, windowWidth - panelWidth - margin);
      const maxY = Math.max(56, windowHeight - bottomInset - panelHeight - margin);
      return {
        x: Math.min(maxX, Math.max(margin, next.x)),
        y: Math.min(maxY, Math.max(56, next.y)),
      };
    },
    [bottomInset, panelSizeStyle.maxHeight, panelSizeStyle.width, windowHeight, windowWidth],
  );

  const derivePanelPositionFromCollapsed = useCallback(
    (anchor: {x: number; y: number}) => {
      const panelWidth = Number(panelSizeStyle.width || 300);
      const panelHeight = Number(panelSizeStyle.maxHeight || 360);
      return clampPanelPosition({
        x: anchor.x + COLLAPSED_SIZE - panelWidth,
        y: anchor.y + COLLAPSED_SIZE - Math.min(panelHeight, 320),
      });
    },
    [clampPanelPosition, panelSizeStyle.maxHeight, panelSizeStyle.width],
  );

  const syncPanelPosition = useCallback(
    (nextMode: 'half' | 'full') => {
      const nextPosition =
        panelMode === 'hidden'
          ? derivePanelPositionFromCollapsed(collapsedPositionRef.current)
          : clampPanelPosition(panelPositionRef.current);
      panelPositionRef.current = nextPosition;
      setPanelPosition(nextPosition);
      setPanelMode(nextMode);
    },
    [clampPanelPosition, derivePanelPositionFromCollapsed, panelMode],
  );

  const openHalfPanel = useCallback(() => {
    syncPanelPosition('half');
    setUiState(prev => reduceAssistantUiState(prev, 'user_open_half'));
  }, [syncPanelPosition]);

  const openFullPanel = useCallback(() => {
    syncPanelPosition('full');
    setUiState(prev => reduceAssistantUiState(prev, 'user_open_full'));
  }, [syncPanelPosition]);

  const closePanel = useCallback(() => {
    const collapsedNext = clampCollapsedPosition(panelPositionRef.current);
    collapsedPositionRef.current = collapsedNext;
    position.setValue(collapsedNext);
    setPanelMode('hidden');
    setUiState(prev => reduceAssistantUiState(prev, 'user_close'));
  }, [clampCollapsedPosition, position]);

  const runGoal = useCallback(
    async (
      goal: string,
      options?: {allowConfirm?: boolean; actionIds?: string[]; inputSource?: 'text' | 'voice'},
    ) => {
      const finalGoal = goal.trim();
      if (!finalGoal) {
        return;
      }
      setLoading(true);
      setErrorText('');
      setStatusText('');
      setMissingContextGuides([]);
      setUiState(prev => reduceAssistantUiState(prev, 'run_start'));
      try {
        const {plan, cycle} = await runAgentGoalCycle({
          goal: finalGoal,
          context: {
            currentTab: activeTab,
            colorContext,
            modelingImageContext,
            latestExecuteResult,
          },
          clientHandlers: {
            navigateToTab: onNavigateTab,
            summarizeCurrentPage: () =>
              buildCurrentPageSummary({
                currentTab: activeTab,
                colorContext,
                modelingImageContext,
                latestPlan,
                latestExecuteResult,
              }),
          },
          options: {
            allowConfirmActions: options?.allowConfirm === true,
            actionIds: options?.actionIds,
            inputSource: options?.inputSource === 'voice' ? 'voice' : 'text',
            executionStrategy,
          },
        });
        setLatestPlan(plan);
        setLatestHydratedActions(cycle.hydratedActions);
        if (cycle.executeResult) {
          setLatestExecuteResult(cycle.executeResult);
        }

        if (cycle.missingContextGuides.length > 0) {
          setMissingContextGuides(cycle.missingContextGuides);
          const hintText = buildMissingContextHintText(cycle.missingContextGuides);
          if (cycle.executeResult) {
            setStatusText('已执行可用步骤，仍缺少上下文。');
          }
          setErrorText(hintText);
          setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
          pushChatMessage('assistant', hintText);
          return;
        }

        if (!cycle.executeResult) {
          setErrorText('执行结果为空');
          setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
          pushChatMessage('assistant', '执行结果为空');
          return;
        }

        setUiState(prev => reduceAssistantUiState(prev, 'run_done'));
        let assistantReply = '';
        const presentation = buildExecuteStatusPresentation(cycle.executeResult);
        if (cycle.executeResult.status === 'pending_confirm') {
          setStatusText(presentation.statusLine);
          assistantReply = presentation.assistantReply;
          openFullPanel();
        } else if (cycle.executeResult.status === 'applied') {
          const handledCount = cycle.executeResult.clientHandledActions?.length || 0;
          setStatusText(
            handledCount > 0 ? `执行完成（客户端补执行 ${handledCount} 项）。` : '执行完成。',
          );
          assistantReply = cycle.executeResult.pageSummary
            ? `${presentation.assistantReply} 当前页摘要：${cycle.executeResult.pageSummary}`
            : presentation.assistantReply;
        } else if (cycle.executeResult.status === 'client_required') {
          setStatusText(presentation.statusLine);
          assistantReply = presentation.assistantReply;
        } else {
          const firstMessage =
            cycle.executeResult.actionResults.find(item => item.status === 'failed')?.message ||
            '执行失败';
          setErrorText(firstMessage);
          setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
          assistantReply = firstMessage;
        }
        pushChatMessage('assistant', assistantReply);
      } catch (error) {
        if (isAgentAuthError(error)) {
          void requestAgentLogin('Hiyori 需要登录后才能继续当前 Agent 工作流。');
        }
        const message = formatApiErrorMessage(error, '执行失败');
        setErrorText(message);
        setUiState(prev => reduceAssistantUiState(prev, 'run_failed'));
        pushChatMessage('assistant', message);
      } finally {
        setLoading(false);
      }
    },
    [
      activeTab,
      colorContext,
      latestExecuteResult,
      latestPlan,
      modelingImageContext,
      onNavigateTab,
      openFullPanel,
      pushChatMessage,
      executionStrategy,
    ],
  );

  const {
    recording: voiceRecording,
    phase: voicePhase,
    liveTranscript: voiceLiveTranscript,
    errorText: voiceErrorText,
    onPressIn: onVoicePressIn,
    onPressOut: onVoicePressOut,
    clearError: clearVoiceError,
  } = useAgentVoiceGoal({
    busy: loading,
    onTranscript: transcript => {
      if (agentAvailabilityKnown && !agentAvailable) {
        pushChatMessage('assistant', '当前未启用 Agent 能力，暂时无法执行该请求。');
        return;
      }
      pushChatMessage('user', transcript);
      runGoal(transcript, {inputSource: 'voice'}).catch(() => undefined);
    },
  });

  useEffect(() => {
    if (!voiceErrorText) {
      return;
    }
    setErrorText(voiceErrorText);
    pushChatMessage('assistant', voiceErrorText);
    clearVoiceError();
  }, [clearVoiceError, pushChatMessage, voiceErrorText]);

  const sendCustomGoal = useCallback(() => {
    const finalGoal = customGoal.trim();
    if (!finalGoal || loading || (agentAvailabilityKnown && !agentAvailable)) {
      if (agentAvailabilityKnown && !agentAvailable) {
        pushChatMessage('assistant', '当前未启用 Agent 能力，暂时无法执行该请求。');
      }
      return;
    }
    pushChatMessage('user', finalGoal);
    setCustomGoal('');
    clearVoiceError();
    runGoal(finalGoal, {inputSource: 'text'});
  }, [
    agentAvailabilityKnown,
    agentAvailable,
    clearVoiceError,
    customGoal,
    loading,
    pushChatMessage,
    runGoal,
  ]);

  const applyPreset = useCallback((preset: AgentPresetDefinition) => {
    setCustomGoal(preset.prompt);
    setExecutionStrategy(preset.recommendedStrategy);
    setErrorText('');
  }, []);

  const runPreset = useCallback(
    (preset: AgentPresetDefinition) => {
      if (loading || (agentAvailabilityKnown && !agentAvailable)) {
        if (agentAvailabilityKnown && !agentAvailable) {
          pushChatMessage('assistant', '当前未启用 Agent 能力，暂时无法执行该请求。');
        }
        return;
      }
      setCustomGoal(preset.prompt);
      setExecutionStrategy(preset.recommendedStrategy);
      pushChatMessage('user', preset.label);
      clearVoiceError();
      runGoal(preset.prompt, {inputSource: 'text'});
    },
    [
      agentAvailabilityKnown,
      agentAvailable,
      clearVoiceError,
      loading,
      pushChatMessage,
      runGoal,
    ],
  );

  const confirmPending = useCallback(async () => {
    if (!latestPlan || pendingActionIds.length === 0 || latestHydratedActions.length === 0) {
      return;
    }
    setLoading(true);
    setErrorText('');
    setMissingContextGuides([]);
    try {
      const cycle = await executeAgentPlanCycle({
        plan: {
          ...latestPlan,
          actions: latestHydratedActions,
        },
        context: {
          currentTab: activeTab,
          colorContext,
          modelingImageContext,
          latestExecuteResult,
        },
        clientHandlers: {
          navigateToTab: onNavigateTab,
          summarizeCurrentPage: () =>
            buildCurrentPageSummary({
              currentTab: activeTab,
              colorContext,
              modelingImageContext,
              latestPlan,
              latestExecuteResult,
            }),
        },
        options: {
          allowConfirmActions: true,
          actionIds: pendingActionIds,
          executionStrategy,
        },
      });
      if (cycle.missingContextGuides.length > 0) {
        setMissingContextGuides(cycle.missingContextGuides);
        const hintText = buildMissingContextHintText(cycle.missingContextGuides);
        setErrorText(hintText);
        pushChatMessage('assistant', hintText);
        return;
      }
      if (!cycle.executeResult) {
        setErrorText('确认执行结果为空');
        pushChatMessage('assistant', '确认执行结果为空');
        return;
      }
      setLatestHydratedActions(cycle.hydratedActions);
      setLatestExecuteResult(cycle.executeResult);
      if (cycle.executeResult.status === 'applied') {
        setStatusText('待确认动作已执行。');
        pushChatMessage(
          'assistant',
          cycle.executeResult.pageSummary
            ? `待确认动作已执行。当前页摘要：${cycle.executeResult.pageSummary}`
            : '待确认动作已执行。',
        );
      } else {
        setStatusText('确认完成，仍有未完成动作。');
        pushChatMessage('assistant', '已完成确认，仍有未完成动作。');
      }
    } catch (error) {
      const message = formatApiErrorMessage(error, '确认执行失败');
      setErrorText(message);
      pushChatMessage('assistant', message);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    colorContext,
    latestExecuteResult,
    latestHydratedActions,
    latestPlan,
    modelingImageContext,
    onNavigateTab,
    pendingActionIds,
    pushChatMessage,
    executionStrategy,
  ]);

  const dismissPending = useCallback(() => {
    setStatusText('已取消待确认动作。');
    pushChatMessage('assistant', '已取消待确认动作。');
    setLatestExecuteResult(prev =>
      prev
        ? {
            ...prev,
            status: 'applied',
            actionResults: prev.actionResults.map(item =>
              item.status === 'pending_confirm'
                ? {
                    ...item,
                    status: 'skipped',
                    message: '用户已取消',
                  }
                : item,
            ),
          }
        : prev,
    );
  }, [pushChatMessage]);

  const resumeWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');
      const cycle = await resumePendingAgentWorkflow({
        context: {
          currentTab: activeTab,
          colorContext,
          modelingImageContext,
          latestExecuteResult,
        },
        clientHandlers: {
          navigateToTab: onNavigateTab,
          summarizeCurrentPage: () =>
            buildCurrentPageSummary({
              currentTab: activeTab,
              colorContext,
              modelingImageContext,
              latestPlan,
              latestExecuteResult,
            }),
        },
        options: {
          allowConfirmActions: true,
        },
      });
      if (!cycle?.executeResult) {
        setStatusText('当前没有可恢复的工作流。');
        return;
      }
      setLatestHydratedActions(cycle.hydratedActions);
      setLatestExecuteResult(cycle.executeResult);
      setMissingContextGuides(cycle.missingContextGuides);
      const presentation = buildExecuteStatusPresentation(cycle.executeResult);
      setStatusText(presentation.statusLine);
      pushChatMessage('assistant', presentation.assistantReply);
    } catch (error) {
      if (isAgentAuthError(error)) {
        void requestAgentLogin('恢复 Agent 工作流需要登录。');
      }
      const message = formatApiErrorMessage(error, '恢复执行失败');
      setErrorText(message);
      pushChatMessage('assistant', message);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    colorContext,
    latestExecuteResult,
    latestPlan,
    modelingImageContext,
    onNavigateTab,
    pushChatMessage,
  ]);

  const cancelWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      const result = await cancelPendingAgentWorkflow();
      if (result) {
        setLatestExecuteResult(result);
        setStatusText('已取消当前续跑工作流。');
        pushChatMessage('assistant', '已取消当前续跑工作流。');
      }
    } catch (error) {
      if (isAgentAuthError(error)) {
        void requestAgentLogin('取消 Agent 工作流需要登录。');
      }
      const message = formatApiErrorMessage(error, '取消执行失败');
      setErrorText(message);
      pushChatMessage('assistant', message);
    } finally {
      setLoading(false);
    }
  }, [pushChatMessage]);

  useEffect(() => {
    setUiState(prev => reduceAssistantUiState(prev, 'app_ready'));
  }, []);

  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: panelMode === 'hidden' ? 0 : 1,
      duration: PANEL_ANIMATION_MS,
      useNativeDriver: false,
    }).start();
  }, [panelAnim, panelMode]);

  useEffect(() => {
    Animated.timing(collapsedIdleAnim, {
      toValue: collapsedIdle ? 1 : 0,
      duration: 220,
      // Keep the collapsed bubble on the JS driver so drag/tap position updates
      // never conflict with an earlier native-driven idle animation.
      useNativeDriver: false,
    }).start();
  }, [collapsedIdle, collapsedIdleAnim]);

  useEffect(() => {
    const listenerId = position.addListener(value => {
      collapsedPositionRef.current = clampCollapsedPosition({
        x: Number(value.x || 0),
        y: Number(value.y || 0),
      });
    });
    return () => {
      position.removeListener(listenerId);
    };
  }, [clampCollapsedPosition, position]);

  useEffect(() => {
    const nextCollapsed = clampCollapsedPosition(collapsedPositionRef.current);
    collapsedPositionRef.current = nextCollapsed;
    position.setValue(nextCollapsed);
    const nextPanel = clampPanelPosition(panelPositionRef.current);
    panelPositionRef.current = nextPanel;
    setPanelPosition(nextPanel);
  }, [clampCollapsedPosition, clampPanelPosition, position]);

  useEffect(() => {
    if (panelMode === 'hidden') {
      scheduleCollapsedIdle();
    } else {
      clearCollapsedIdleTimer();
      setCollapsedIdle(false);
    }

    return () => {
      clearCollapsedIdleTimer();
    };
  }, [clearCollapsedIdleTimer, panelMode, scheduleCollapsedIdle]);

  useEffect(() => {
    if (panelMode !== 'hidden') {
      setLive2dFailed(false);
      setLive2dReady(false);
    }
  }, [panelMode]);

  useEffect(() => {
    if (previousTabRef.current === activeTab) {
      return;
    }
    previousTabRef.current = activeTab;
    const page = mapTabToScenePage(activeTab);
    const now = Date.now();
    const matchedRule = assistantTriggerRules
      .filter(rule => rule.page === page && rule.trigger === 'page_enter')
      .sort((a, b) => b.priority - a.priority)
      .find(rule => shouldTriggerRule(assistantFrequency, now, rule));
    if (!matchedRule) {
      return;
    }
    setAssistantFrequency(prev => markRuleShown(prev, matchedRule, now));
    currentRuleIdRef.current = matchedRule.id;
    setBubbleText(matchedRule.text);
    setBubbleVisible(true);
    setUiState(prev => reduceAssistantUiState(prev, 'system_remind'));
    if (bubbleTimerRef.current) {
      clearTimeout(bubbleTimerRef.current);
    }
    bubbleTimerRef.current = setTimeout(() => {
      setBubbleVisible(false);
      setUiState(prev => reduceAssistantUiState(prev, 'auto_reset'));
    }, BUBBLE_AUTO_HIDE_MS);

    if (matchedRule.action === 'open_half') {
      setTimeout(() => {
        openHalfPanel();
      }, 220);
    }
  }, [activeTab, assistantFrequency, openHalfPanel, setAssistantFrequency]);

  useEffect(
    () => () => {
      if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
      }
    },
    [],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          panelMode === 'hidden' &&
          (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
          onPanResponderGrant: () => {
          markCollapsedActive();
          position.stopAnimation(current => {
            panStartRef.current = {x: current.x, y: current.y};
          });
          setUiState(prev => reduceAssistantUiState(prev, 'user_drag_start'));
        },
        onPanResponderMove: (_, gestureState) => {
          position.setValue({
            x: panStartRef.current.x + gestureState.dx,
            y: panStartRef.current.y + gestureState.dy,
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          const releaseX = panStartRef.current.x + gestureState.dx;
          const snappedX =
            releaseX < windowWidth / 2
              ? 8
              : Math.max(8, windowWidth - COLLAPSED_SIZE - 8);
          const nextCollapsed = clampCollapsedPosition({
            x: snappedX,
            y: panStartRef.current.y + gestureState.dy,
          });
          Animated.spring(position, {
            toValue: nextCollapsed,
            useNativeDriver: false,
            bounciness: 5,
          }).start();
          setUiState(prev => reduceAssistantUiState(prev, 'user_drag_end'));
        },
      }),
    [clampCollapsedPosition, markCollapsedActive, panelMode, position, windowWidth],
  );

  const panelPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          panelMode !== 'hidden' &&
          (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
        onPanResponderGrant: () => {
          panStartRef.current = {...panelPositionRef.current};
        },
        onPanResponderMove: (_, gestureState) => {
          const next = clampPanelPosition({
            x: panStartRef.current.x + gestureState.dx,
            y: panStartRef.current.y + gestureState.dy,
          });
          panelPositionRef.current = next;
          setPanelPosition(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          const next = clampPanelPosition({
            x: panStartRef.current.x + gestureState.dx,
            y: panStartRef.current.y + gestureState.dy,
          });
          panelPositionRef.current = next;
          setPanelPosition(next);
          collapsedPositionRef.current = clampCollapsedPosition(next);
        },
      }),
    [clampCollapsedPosition, clampPanelPosition, panelMode],
  );

  const chatListModeStyle = useMemo(
    () => ({
      height:
        panelMode === 'half'
          ? Math.max(92, Math.floor(windowHeight * 0.18))
          : Math.max(150, Math.floor(windowHeight * 0.32)),
    }),
    [panelMode, windowHeight],
  );

  const live2dUri = useMemo(() => {
    const width = Math.max(0, Math.round(avatarViewport.width));
    const height = Math.max(0, Math.round(avatarViewport.height));
    return `${HIYORI_LIVE2D_PAGE_URI}?w=${width}&h=${height}`;
  }, [avatarViewport.height, avatarViewport.width]);

  const collapsedAvatarNode = (
    <View style={[styles.avatarShellCompact, collapsedIdle && styles.avatarShellCompactIdle]}>
      <Icon name="sparkles" size={24} color={collapsedIdle ? '#E2E8F0' : '#FFFFFF'} />
      {loading ? (
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>思考中</Text>
        </View>
      ) : null}
    </View>
  );

  const panelAvatarNode = (
    <View
      style={[
        styles.avatarPanelShell,
        panelMode === 'full' ? styles.avatarPanelShellFull : styles.avatarPanelShellHalf,
      ]}
      renderToHardwareTextureAndroid
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        if (
          Math.abs(width - avatarViewport.width) > 0.5 ||
          Math.abs(height - avatarViewport.height) > 0.5
        ) {
          setAvatarViewport({width, height});
        }
      }}>
      {!live2dFailed && avatarViewport.width > 8 && avatarViewport.height > 8 ? (
        <View style={styles.avatarLive2dHost}>
          <WebView
            key={`live2d-${Math.round(avatarViewport.width)}x${Math.round(avatarViewport.height)}-${panelMode}`}
            source={{uri: live2dUri}}
            originWhitelist={['*']}
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            androidLayerType="hardware"
            androidHardwareAccelerationDisabled={false}
            javaScriptEnabled
            scrollEnabled={false}
            bounces={false}
            onLoadStart={() => {
              setLive2dReady(false);
              setLive2dFailed(false);
            }}
            onError={() => {
              setLive2dFailed(true);
            }}
            onMessage={event => {
              try {
                const payload = JSON.parse(event.nativeEvent.data) as {
                  type?: string;
                  message?: string;
                };
                if (payload.type === 'loaded') {
                  setLive2dReady(true);
                  setLive2dFailed(false);
                }
                if (payload.type === 'error') {
                  setLive2dFailed(true);
                  if (typeof payload.message === 'string' && payload.message.trim()) {
                    setErrorText(payload.message);
                  }
                }
                if (payload.type === 'diag' && typeof payload.message === 'string') {
                  return;
                }
              } catch {
                // ignore invalid payload
              }
            }}
            style={styles.avatarLive2dWebView}
          />
        </View>
      ) : null}
      {!live2dReady || live2dFailed ? (
        <View style={styles.avatarPanelOverlay}>
          {live2dFailed ? (
            <Text style={styles.avatarPanelOverlayText}>模型加载失败</Text>
          ) : (
            <>
              <ActivityIndicator size="small" color="#F8D7C2" />
              <Text style={styles.avatarPanelOverlayText}>加载 Hiyori 模型中...</Text>
            </>
          )}
        </View>
      ) : null}
      {loading ? (
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>思考中</Text>
        </View>
      ) : null}
    </View>
  );

  const toRequiredContextText = useCallback((value: string | null | undefined) => {
    if (value === 'context.color.image') {
      return '调色图片';
    }
    if (value === 'context.modeling.image') {
      return '建模图片';
    }
    if (value === 'context.community.draftId') {
      return '社区草稿';
    }
    return value || '';
  }, []);

  const workflowProgressText = useMemo(() => {
    const total = Number(latestExecuteResult?.workflowState?.totalSteps || 0);
    if (!latestExecuteResult || total <= 0) {
      return '';
    }
    const current = Number(latestExecuteResult.workflowState?.currentStep || 0);
    return `链路进度 ${Math.min(Math.max(current, 0), total)}/${total}`;
  }, [latestExecuteResult]);

  const latestRunStatusText = useMemo(() => {
    const status =
      latestExecuteResult?.workflowRun?.status ||
      pendingWorkflow?.workflowRun?.status ||
      persistedRunRef?.status ||
      null;
    return toWorkflowRunStatusText(status);
  }, [latestExecuteResult?.workflowRun?.status, pendingWorkflow?.workflowRun?.status, persistedRunRef?.status]);

  const combinedResultText = useMemo(() => {
    if (!latestExecuteResult) {
      return '';
    }
    const clientHandledCount = latestExecuteResult.clientHandledActions?.length || 0;
    const appliedCount = latestExecuteResult.actionResults.filter(item => item.status === 'applied').length;
    const serverAppliedCount = Math.max(0, appliedCount - clientHandledCount);
    if (serverAppliedCount > 0 && clientHandledCount > 0) {
      return `服务端已执行 ${serverAppliedCount} 项，客户端补执行 ${clientHandledCount} 项`;
    }
    if (clientHandledCount > 0) {
      return `客户端补执行 ${clientHandledCount} 项`;
    }
    return '';
  }, [latestExecuteResult]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {bubbleVisible && panelMode === 'hidden' ? (
        <Pressable
          style={[
            styles.bubble,
            styles.bubbleAnchor,
            {
              bottom: bottomInset + PANEL_BOTTOM_OFFSET + 84,
            },
          ]}
          onPress={() => {
            hideBubble();
            openHalfPanel();
          }}>
          <Text style={styles.bubbleText}>{bubbleText}</Text>
        </Pressable>
      ) : null}

      {panelMode === 'hidden' ? (
        <Animated.View
          style={[
            styles.collapsedWrap,
            {
              opacity: collapsedIdleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.5],
              }),
              transform: [{translateX: position.x}, {translateY: position.y}],
            },
          ]}
          {...panResponder.panHandlers}>
            <Pressable
              style={[styles.collapsedPressable, collapsedIdle && styles.collapsedPressableIdle]}
              onPress={() => {
                markCollapsedActive();
                openHalfPanel();
              }}
              onLongPress={() => {
                markCollapsedActive();
                hideBubble();
                const currentRuleId = currentRuleIdRef.current;
                if (currentRuleId) {
                setAssistantFrequency(prev => markRuleIgnored(prev, currentRuleId));
              }
            }}>
            {collapsedAvatarNode}
          </Pressable>
        </Animated.View>
      ) : null}

      {panelMode !== 'hidden' ? (
        <Animated.View
          style={[
            styles.panelWrap,
            panelSizeStyle,
            {
              left: panelPosition.x,
              top: panelPosition.y,
              opacity: panelAnim,
              transform: [
                {
                  translateY: panelAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}>
          <View pointerEvents="none" style={styles.panelSolidBackdrop} />
          <View style={styles.panelHeader} {...panelPanResponder.panHandlers}>
            <Text style={styles.panelTitle}>Hiyori 对话助手</Text>
            <View style={styles.panelHeaderActions}>
              {panelMode === 'half' ? (
                <Pressable style={styles.headerBtn} onPress={openFullPanel}>
                  <Icon name="expand" size={14} color="#F3DDCD" />
                </Pressable>
              ) : null}
              <Pressable style={styles.headerBtn} onPress={closePanel}>
                <Icon name="close" size={15} color="#F3DDCD" />
              </Pressable>
            </View>
          </View>
          <View
            style={[
              styles.panelBody,
              panelMode === 'half'
                ? styles.panelBodyTop
                : PANEL_CONFIG.expandedLayout?.avatarAnchor === 'top'
                  ? styles.panelBodyTop
                  : styles.panelBodyLeft,
            ]}>
            <View
              style={[
                styles.panelAvatarArea,
                panelMode === 'half' ? styles.panelAvatarAreaCompact : null,
                panelMode === 'half' ? styles.panelAvatarAreaStacked : null,
                panelMode === 'full'
                  ? {flex: Math.max(0.28, PANEL_CONFIG.expandedLayout?.avatarRatio || 0.32)}
                  : null,
              ]}>
              {panelAvatarNode}
              <Text style={styles.avatarName}>Hiyori</Text>
              {panelMode === 'full' ? <Text style={styles.avatarHint}>动漫助手 · 对话模式</Text> : null}
            </View>
            <View style={styles.panelContentArea}>
              <ScrollView
                style={[styles.chatList, chatListModeStyle]}
                contentContainerStyle={styles.chatListContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator>
                {chatMessages.map(message => (
                  <View
                    key={message.id}
                    style={[
                      styles.chatBubble,
                      message.role === 'assistant' ? styles.chatBubbleAssistant : styles.chatBubbleUser,
                    ]}>
                    <Text
                      style={[
                        styles.chatBubbleText,
                        message.role === 'assistant' ? styles.chatBubbleTextAssistant : styles.chatBubbleTextUser,
                      ]}>
                      {message.text}
                    </Text>
                  </View>
                ))}
                {loading ? (
                  <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                    <Text style={[styles.chatBubbleText, styles.chatBubbleTextAssistant]}>正在处理你的请求...</Text>
                  </View>
                ) : null}
              </ScrollView>
              <View style={styles.strategyRail}>
                <ScrollView
                  horizontal
                  style={styles.strategyScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.strategyRow}>
                  {AGENT_STRATEGY_OPTIONS.map(item => {
                    const active = executionStrategy === item.value;
                    return (
                      <Pressable
                        key={item.value}
                        style={[styles.strategyChip, active && styles.strategyChipActive]}
                        onPress={() => setExecutionStrategy(item.value)}>
                        <Text style={[styles.strategyChipText, active && styles.strategyChipTextActive]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.presetRail}>
                <ScrollView
                  horizontal
                  style={styles.strategyScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetRow}>
                  {AGENT_PRESETS.map(item => (
                    <View key={item.id} style={styles.presetCard}>
                      <View style={styles.presetCardHead}>
                        <Icon name={item.icon} size={14} color="#4338CA" />
                        <Text style={styles.presetCardTitle}>{item.label}</Text>
                      </View>
                      <Text style={styles.presetCardStage}>{item.stageLabel}</Text>
                      <Text style={styles.presetCardSummary}>{item.summary}</Text>
                      <View style={styles.presetCardActions}>
                        <Pressable
                          style={styles.presetGhostBtn}
                          testID={`hiyori-preset-fill-${item.id}`}
                          onPress={() => applyPreset(item)}>
                          <Text style={styles.presetGhostBtnText}>填入</Text>
                        </Pressable>
                        <Pressable
                          style={styles.presetPrimaryBtn}
                          testID={`hiyori-preset-run-${item.id}`}
                          onPress={() => runPreset(item)}>
                          <Text style={styles.presetPrimaryBtnText}>执行</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.customGoalWrap}>
                <TextInput
                  testID="assistant-custom-goal-input"
                  value={customGoal}
                  onChangeText={setCustomGoal}
                  placeholder="输入你的需求，按发送开始执行"
                  placeholderTextColor="rgba(252,236,227,0.46)"
                  style={styles.customGoalInput}
                  multiline
                  numberOfLines={panelMode === 'half' ? 2 : 3}
                  textAlignVertical="top"
                  editable={!loading && (!agentAvailabilityKnown || agentAvailable)}
                  onSubmitEditing={sendCustomGoal}
                />
                <View style={styles.customGoalActionsRow}>
                  <Pressable
                    style={[
                      styles.customGoalBtn,
                      styles.customGoalBtnPrimary,
                      ((agentAvailabilityKnown && !agentAvailable) || loading) &&
                        styles.customGoalBtnDisabled,
                    ]}
                    disabled={loading || (agentAvailabilityKnown && !agentAvailable)}
                    onPress={sendCustomGoal}>
                    <Icon name="send" size={14} color="#FFEEDF" />
                    <Text style={styles.customGoalBtnText}>发送</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.customGoalBtn,
                      styles.customGoalBtnSecondary,
                      voiceRecording && styles.customGoalBtnVoiceActive,
                      ((agentAvailabilityKnown && !agentAvailable) || loading) &&
                        styles.customGoalBtnDisabled,
                    ]}
                    disabled={loading || (agentAvailabilityKnown && !agentAvailable)}
                    onPressIn={onVoicePressIn}
                    onPressOut={onVoicePressOut}>
                    <Icon name={voiceRecording ? 'mic' : 'mic-outline'} size={14} color="#FFEEDF" />
                    <Text style={styles.customGoalBtnText}>{voiceRecording ? '松开结束' : '语音输入'}</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.voiceMetaText}>
                语音阶段: {voicePhase}
                {voiceLiveTranscript ? ` | ${voiceLiveTranscript}` : ''}
              </Text>
              <Text style={styles.voiceMetaText}>
                策略 {executionStrategy} | workflow {latestRunStatusText}
              </Text>
              {(pendingWorkflow || persistedRunRef) && !loading ? (
                <View style={styles.pendingActions}>
                  <Pressable style={styles.pendingBtn} onPress={resumeWorkflow}>
                    <Icon name="refresh-circle" size={14} color="#FFEEDF" />
                    <Text style={styles.pendingBtnText}>恢复续跑</Text>
                  </Pressable>
                  <Pressable style={[styles.pendingBtn, styles.pendingBtnGhost]} onPress={cancelWorkflow}>
                    <Icon name="close-circle" size={14} color="#FFD8D8" />
                    <Text style={[styles.pendingBtnText, styles.pendingBtnTextGhost]}>取消续跑</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          {(statusText || errorText || pendingActionIds.length > 0 || missingContextGuides.length > 0) && (
            <View style={styles.feedbackBar}>
              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
              {!errorText && statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
              {latestExecuteResult && !errorText ? (
                <Text style={styles.statusText}>执行状态: {toResultStatusText(latestExecuteResult.status)}</Text>
              ) : null}
              {latestExecuteResult?.workflowRun ? (
                <Text style={styles.statusText}>
                  运行态: {toWorkflowRunStatusText(latestExecuteResult.workflowRun.status)} · runId{' '}
                  {latestExecuteResult.workflowRun.runId}
                </Text>
              ) : null}
              {combinedResultText ? <Text style={styles.statusText}>{combinedResultText}</Text> : null}
              {workflowProgressText ? <Text style={styles.statusText}>{workflowProgressText}</Text> : null}
              {latestExecuteResult?.workflowState?.nextRequiredContext ? (
                <Text style={styles.statusText}>
                  下一步需要: {toRequiredContextText(latestExecuteResult.workflowState.nextRequiredContext)}
                </Text>
              ) : null}
              {latestExecuteResult?.resultSummary ? (
                <Text style={styles.statusText}>
                  {latestExecuteResult.resultSummary.done} {latestExecuteResult.resultSummary.next}
                </Text>
              ) : null}
              {latestExecuteResult?.nextAction?.label ? (
                <Text style={styles.statusText}>建议下一步: {latestExecuteResult.nextAction.label}</Text>
              ) : null}
              {latestExecuteResult?.resultCards?.slice(0, 2).map((card, index) => (
                <Text key={`${card.kind}_${index}`} style={styles.statusText}>
                  {card.title}: {card.summary}
                </Text>
              ))}
              {runHistory.slice(-2).reverse().map(item => (
                <Text key={item.id} style={styles.statusText}>
                  历史 {item.type}: {item.message}
                </Text>
              ))}
              {missingContextGuides[0] ? (
                <Pressable
                  style={styles.pendingBtn}
                  onPress={() => onNavigateTab(missingContextGuides[0].targetTab)}>
                  <Icon name="arrow-forward-circle" size={14} color="#FFEEDF" />
                  <Text style={styles.pendingBtnText}>{toContextJumpLabel(missingContextGuides[0])}</Text>
                </Pressable>
              ) : null}
              {pendingActionIds.length > 0 ? (
                <View style={styles.pendingActions}>
                  <Pressable style={styles.pendingBtn} onPress={confirmPending} disabled={loading}>
                    <Icon name="checkmark-circle" size={14} color="#FFEEDF" />
                    <Text style={styles.pendingBtnText}>确认执行</Text>
                  </Pressable>
                  <Pressable style={[styles.pendingBtn, styles.pendingBtnGhost]} onPress={dismissPending}>
                    <Icon name="close-circle" size={14} color="#FFD8D8" />
                    <Text style={[styles.pendingBtnText, styles.pendingBtnTextGhost]}>取消</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  collapsedWrap: {
    position: 'absolute',
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    zIndex: 20,
  },
  collapsedPressable: {
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(165,180,252,0.2)',
    backgroundColor: 'rgba(15,23,42,0.84)',
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 10},
  },
  collapsedPressableIdle: {
    backgroundColor: 'rgba(100,116,139,0.54)',
    borderColor: 'rgba(203,213,225,0.42)',
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
  },
  avatarShellCompact: {
    flex: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.84)',
  },
  avatarShellCompactIdle: {
    backgroundColor: 'rgba(100,116,139,0.54)',
  },
  avatarPanelShell: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(28,19,16,0.9)',
  },
  avatarPanelShellHalf: {
    height: 100,
  },
  avatarPanelShellFull: {
    height: 138,
  },
  avatarLive2dHost: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 1,
    minHeight: 1,
  },
  avatarLive2dWebView: {
    flex: 1,
    minWidth: 1,
    minHeight: 1,
    backgroundColor: 'transparent',
  },
  avatarPanelOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,19,16,0.72)',
  },
  avatarPanelOverlayText: {
    color: '#F8DCCB',
    fontSize: 11,
    fontWeight: '600',
  },
  avatarBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: 'rgba(22,16,14,0.72)',
  },
  avatarBadgeText: {
    color: '#F9E0CD',
    fontSize: 10,
    fontWeight: '700',
  },
  bubble: {
    position: 'absolute',
    maxWidth: 248,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#FFFFFF',
    zIndex: 21,
  },
  bubbleAnchor: {
    right: 14,
  },
  bubbleText: {
    color: '#0F172A',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  panelWrap: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#FFFFFF',
    padding: 12,
    zIndex: 22,
    shadowColor: '#94A3B8',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
  },
  panelSolidBackdrop: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 2,
  },
  panelTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  panelHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#F8FAFC',
  },
  panelBody: {
    gap: 10,
  },
  panelBodyLeft: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  panelBodyTop: {
    flexDirection: 'column',
  },
  panelAvatarArea: {
    width: 112,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#F8FAFC',
    padding: 8,
    marginRight: 10,
  },
  panelAvatarAreaCompact: {
    width: 90,
    padding: 6,
    minHeight: 150,
  },
  panelAvatarAreaStacked: {
    width: '100%',
    marginRight: 0,
    marginBottom: 8,
  },
  avatarName: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  avatarHint: {
    color: 'rgba(100,116,139,0.9)',
    fontSize: 10,
    marginTop: 2,
  },
  panelContentArea: {
    flex: 1,
    minHeight: 0,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  chatList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  chatListContent: {
    gap: 6,
    paddingBottom: 4,
  },
  chatBubble: {
    maxWidth: '94%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#F8FAFC',
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    borderColor: 'rgba(165,180,252,0.18)',
    backgroundColor: '#4F46E5',
  },
  chatBubbleText: {
    fontSize: 12,
    lineHeight: 17,
  },
  chatBubbleTextAssistant: {
    color: '#0F172A',
  },
  chatBubbleTextUser: {
    color: '#FFFFFF',
  },
  strategyRail: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 2,
  },
  strategyScroll: {
    backgroundColor: '#FFFFFF',
  },
  strategyRow: {
    gap: 8,
    paddingLeft: 2,
    paddingRight: 8,
  },
  strategyChip: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#F8FAFC',
  },
  strategyChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: 'rgba(99,102,241,0.28)',
  },
  strategyChipText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  strategyChipTextActive: {
    color: '#4338CA',
  },
  presetRail: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  presetRow: {
    gap: 8,
    paddingLeft: 2,
    paddingRight: 8,
  },
  presetCard: {
    width: 176,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  presetCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetCardTitle: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  presetCardStage: {
    color: '#6366F1',
    fontSize: 10,
    fontWeight: '600',
  },
  presetCardSummary: {
    color: '#475569',
    fontSize: 10,
    lineHeight: 14,
  },
  presetCardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  presetGhostBtn: {
    flex: 1,
    minHeight: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.18)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetGhostBtnText: {
    color: '#4338CA',
    fontSize: 11,
    fontWeight: '700',
  },
  presetPrimaryBtn: {
    flex: 1,
    minHeight: 30,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  customGoalWrap: {
    marginTop: 2,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  customGoalInput: {
    width: '100%',
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#F1F5F9',
  },
  customGoalActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customGoalBtn: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    flex: 1,
  },
  customGoalBtnPrimary: {
    backgroundColor: '#4F46E5',
  },
  customGoalBtnSecondary: {
    backgroundColor: '#5B4FE8',
  },
  customGoalBtnDisabled: {
    opacity: 0.55,
  },
  customGoalBtnVoiceActive: {
    backgroundColor: '#4338CA',
  },
  customGoalBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceMetaText: {
    color: 'rgba(100,116,139,0.9)',
    fontSize: 10,
    marginTop: 2,
  },
  feedbackBar: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: '#F8FAFC',
    padding: 9,
    gap: 8,
  },
  statusText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  errorText: {
    color: '#F43F5E',
    fontSize: 11,
    fontWeight: '600',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  pendingBtnGhost: {
    backgroundColor: 'rgba(226,232,240,0.98)',
  },
  pendingBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  pendingBtnTextGhost: {
    color: '#334155',
  },
});
