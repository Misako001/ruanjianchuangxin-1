import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  agentApi,
  formatApiErrorMessage,
  type AgentExecuteResponse,
  type AgentModuleHealthResponse,
  type AgentPlanResponse,
  type ModuleCapabilityItem,
} from '../modules/api';
import {PageHero} from '../components/app/PageHero';
import {GlassCard} from '../components/ui/GlassCard';
import {PrimaryButton} from '../components/ui/PrimaryButton';
import {HERO_AGENT} from '../assets/design';
import {canvasText, canvasUi, cardSurfaceViolet, glassShadow} from '../theme/canvasDesign';
import {useAgentExecutionContextStore} from '../agent/executionContextStore';
import {
  buildExecuteStatusPresentation,
  buildCurrentPageSummary,
  buildMissingContextHintText,
  cancelPendingAgentWorkflow,
  executeAgentPlanCycle,
  resumePendingAgentWorkflow,
  runAgentGoalCycle,
  toActionStatusText,
  toResultStatusText,
  toWorkflowRunStatusText,
  type AgentClientTab,
  type AgentExecuteCycleResult,
  type AgentExecutionStrategy,
  type MissingContextGuide,
} from '../agent/dualEntryOrchestrator';
import {useAgentVoiceGoal} from '../agent/useAgentVoiceGoal';
import {semanticColors} from '../theme/tokens';
import {useAgentWorkflowContinuationStore} from '../agent/workflowContinuationStore';
import {requestAgentLogin} from '../agent/authPromptStore';

const QUICK_PROMPTS: Array<{
  icon: string;
  label: string;
  prompt: string;
}> = [
  {
    icon: 'color-palette',
    label: '批量调色',
    prompt: '根据当前状态给我一个调色优化执行计划',
  },
  {
    icon: 'cube',
    label: '3D 任务',
    prompt: '先规划 2D 转 3D 任务，再给出下一步建议',
  },
  {
    icon: 'paper-plane',
    label: '社区发布',
    prompt: '帮我规划并执行一次社区草稿发布流程',
  },
];

const STRATEGY_OPTIONS: Array<{
  value: AgentExecutionStrategy;
  label: string;
  description: string;
}> = [
  {value: 'adaptive', label: '自适应', description: '系统自动平衡速度与质量'},
  {value: 'fast', label: '快速', description: '优先更快给出可执行结果'},
  {value: 'quality', label: '质量', description: '优先规划更完整的链路'},
  {value: 'cost', label: '成本', description: '优先轻量、可降级执行'},
];

interface AgentScreenProps {
  capabilities: ModuleCapabilityItem[];
  activeTab: AgentClientTab;
  onNavigateTab: (tab: AgentClientTab) => void;
}

const toJumpButtonText = (guide: MissingContextGuide): string =>
  guide.targetTab === 'model' ? '去建模页补图' : '去调色页补图';

const isAgentAuthError = (error: unknown): boolean => {
  const code = String((error as {code?: unknown})?.code || '').trim().toLowerCase();
  const message = String((error as Error)?.message || '').trim().toLowerCase();
  return code === 'http_401' || code === 'unauthorized' || message.includes('unauthorized');
};

export const AgentScreen: React.FC<AgentScreenProps> = ({
  capabilities,
  activeTab,
  onNavigateTab,
}) => {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<AgentPlanResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<AgentExecuteResponse | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [missingContextGuides, setMissingContextGuides] = useState<MissingContextGuide[]>([]);
  const [executionStrategy, setExecutionStrategy] = useState<AgentExecutionStrategy>('adaptive');
  const [agentHealth, setAgentHealth] = useState<AgentModuleHealthResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [runHistory, setRunHistory] = useState<Array<{id: string; type: string; status: string; message: string; createdAt: string}>>([]);
  const colorContext = useAgentExecutionContextStore(state => state.colorContext);
  const modelingImageContext = useAgentExecutionContextStore(
    state => state.modelingImageContext,
  );
  const pendingWorkflow = useAgentWorkflowContinuationStore(state => state.pendingWorkflow);
  const persistedRunRef = useAgentWorkflowContinuationStore(state => state.persistedRunRef);
  const busy = loadingPlan || loadingExecute;

  const agentCapability = capabilities.find(item => item.module === 'agent');

  useEffect(() => {
    let cancelled = false;
    agentApi
      .getAgentHealth()
      .then(result => {
        if (!cancelled) {
          setAgentHealth(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentHealth(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persistedRunRef?.runId) {
      setRunHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [persistedRunRef?.runId]);

  const planStatusText = useMemo(() => {
    if (!plan) {
      return '等待生成计划';
    }
    const plannerSourceText = plan.plannerSource === 'cloud' ? '云端规划' : '本地规划';
    const strategyText = plan.executionStrategy ? ` · 策略 ${plan.executionStrategy}` : '';
    return `${plan.estimatedSteps} 步 · ${plannerSourceText}${strategyText}`;
  }, [plan]);

  const executeProgress = useMemo(() => {
    if (!executeResult || !executeResult.actionResults.length) {
      return 0;
    }
    const completed = executeResult.actionResults.filter(
      item => item.status === 'applied',
    ).length;
    return Math.round((completed / executeResult.actionResults.length) * 100);
  }, [executeResult]);

  const workflowProgressText = useMemo(() => {
    const total = Number(executeResult?.workflowState?.totalSteps || 0);
    if (!executeResult || total <= 0) {
      return '';
    }
    const current = Math.max(0, Number(executeResult.workflowState?.currentStep || 0));
    return `${Math.min(Math.max(current, 0), total)}/${total}`;
  }, [executeResult]);

  const toContextLabel = (key: string | null | undefined): string => {
    if (key === 'context.color.image') {
      return '调色图片';
    }
    if (key === 'context.modeling.image') {
      return '建模图片';
    }
    if (key === 'context.community.draftId') {
      return '社区草稿';
    }
    return key || '-';
  };

  const resultSummaryText = useMemo(() => {
    if (!executeResult) {
      return '';
    }
    const clientHandledCount = executeResult.clientHandledActions?.length || 0;
    const appliedCount = executeResult.actionResults.filter(item => item.status === 'applied').length;
    const serviceAppliedCount = Math.max(0, appliedCount - clientHandledCount);
    if (serviceAppliedCount > 0 && clientHandledCount > 0) {
      return `服务端已执行 ${serviceAppliedCount} 项，客户端补执行 ${clientHandledCount} 项。`;
    }
    if (clientHandledCount > 0) {
      return `客户端补执行 ${clientHandledCount} 项。`;
    }
    if (appliedCount > 0) {
      return `已执行 ${appliedCount} 项动作。`;
    }
    return '';
  }, [executeResult]);

  const statusPresentation = useMemo(
    () => (executeResult ? buildExecuteStatusPresentation(executeResult) : null),
    [executeResult],
  );

  const latestRunStatusText = useMemo(() => {
    const status =
      executeResult?.workflowRun?.status ||
      pendingWorkflow?.workflowRun?.status ||
      persistedRunRef?.status ||
      null;
    return toWorkflowRunStatusText(status);
  }, [executeResult?.workflowRun?.status, pendingWorkflow?.workflowRun?.status, persistedRunRef?.status]);

  const toRiskText = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'low':
        return '低';
      case 'medium':
        return '中';
      case 'high':
        return '高';
      default:
        return riskLevel || '-';
    }
  };

  const applyCycleResult = useCallback(
    (cycle: AgentExecuteCycleResult) => {
      setPlan(prev => (prev ? {...prev, actions: cycle.hydratedActions} : prev));
      if (cycle.executeResult) {
        setExecuteResult(cycle.executeResult);
      }
      if (cycle.missingContextGuides.length > 0) {
        setMissingContextGuides(cycle.missingContextGuides);
        setErrorText(buildMissingContextHintText(cycle.missingContextGuides));
        return;
      }
      setMissingContextGuides([]);
      if (!cycle.executeResult) {
        return;
      }
      if (cycle.executeResult.status === 'failed') {
        const firstFailure =
          cycle.executeResult.actionResults.find(item => item.status === 'failed')?.message ||
          '执行失败';
        setErrorText(firstFailure);
        return;
      }
      setErrorText('');
    },
    [],
  );

  const runGoal = useCallback(
    async (goal: string, inputSource: 'text' | 'voice') => {
      const finalGoal = goal.trim();
      if (!finalGoal) {
        setErrorText('请输入任务目标');
        return;
      }
      try {
        setLoadingPlan(true);
        setLoadingExecute(true);
        setErrorText('');
        setMissingContextGuides([]);
        setExecuteResult(null);
        const {plan: nextPlan, cycle} = await runAgentGoalCycle({
          goal: finalGoal,
          context: {
            currentTab: activeTab,
            colorContext,
            modelingImageContext,
            latestExecuteResult: executeResult,
          },
          clientHandlers: {
            navigateToTab: tab => {
              setTimeout(() => onNavigateTab(tab), 0);
            },
            summarizeCurrentPage: () =>
              buildCurrentPageSummary({
                currentTab: activeTab,
                colorContext,
                modelingImageContext,
                latestPlan: nextPlan,
                latestExecuteResult: executeResult,
              }),
          },
          options: {
            inputSource,
            executionStrategy,
          },
        });
        setPlan({...nextPlan, actions: cycle.hydratedActions});
        applyCycleResult(cycle);
      } catch (error) {
        if (isAgentAuthError(error)) {
          void requestAgentLogin('Agent 执行需要登录。登录后可以继续当前工作流。');
        }
        setErrorText(formatApiErrorMessage(error, '执行失败'));
      } finally {
        setLoadingPlan(false);
        setLoadingExecute(false);
      }
    },
    [
      activeTab,
      applyCycleResult,
      colorContext,
      executeResult,
      modelingImageContext,
      onNavigateTab,
      executionStrategy,
    ],
  );

  const {
    recording,
    phase: voicePhase,
    liveTranscript,
    errorText: voiceErrorText,
    onPressIn: onVoicePressIn,
    onPressOut: onVoicePressOut,
    clearError: clearVoiceError,
  } = useAgentVoiceGoal({
    busy,
    onTranscript: transcript => {
      setPrompt(transcript);
      runGoal(transcript, 'voice').catch(() => undefined);
    },
  });

  useEffect(() => {
    if (voiceErrorText) {
      setErrorText(voiceErrorText);
    }
  }, [voiceErrorText]);

  const createPlan = async () => {
    if (!prompt.trim()) {
      setErrorText('请输入任务目标');
      return;
    }
    try {
      setLoadingPlan(true);
      setErrorText('');
      setExecuteResult(null);
      setMissingContextGuides([]);
      const nextPlan = await agentApi.createPlan(
        prompt.trim(),
        activeTab,
        'text',
        executionStrategy === 'adaptive' ? undefined : executionStrategy,
      );
      setPlan(nextPlan);
    } catch (error) {
      if (isAgentAuthError(error)) {
        void requestAgentLogin('Agent 计划执行需要登录。登录后可以继续当前工作流。');
      }
      setErrorText(formatApiErrorMessage(error, '计划生成失败'));
    } finally {
      setLoadingPlan(false);
    }
  };

  const executePlan = async () => {
    if (!plan) {
      setErrorText('请先生成计划');
      return;
    }
    const pendingActionIds =
      executeResult?.status === 'pending_confirm'
        ? executeResult.actionResults
            .filter(item => item.status === 'pending_confirm')
            .map(item => item.action.actionId)
        : [];
    try {
      setLoadingExecute(true);
      clearVoiceError();
      setErrorText('');
      const cycle = await executeAgentPlanCycle({
        plan,
        context: {
          currentTab: activeTab,
          colorContext,
          modelingImageContext,
          latestExecuteResult: executeResult,
        },
        clientHandlers: {
          navigateToTab: tab => {
            setTimeout(() => onNavigateTab(tab), 0);
          },
          summarizeCurrentPage: () =>
            buildCurrentPageSummary({
              currentTab: activeTab,
              colorContext,
              modelingImageContext,
              latestPlan: plan,
              latestExecuteResult: executeResult,
            }),
        },
        options: {
          actionIds: pendingActionIds.length ? pendingActionIds : undefined,
          allowConfirmActions: pendingActionIds.length > 0,
          executionStrategy,
        },
      });
      applyCycleResult(cycle);
    } catch (error) {
      if (isAgentAuthError(error)) {
        void requestAgentLogin('Agent 计划执行需要登录。登录后可以继续当前工作流。');
      }
      setErrorText(formatApiErrorMessage(error, '计划执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  const resumeWorkflow = async () => {
    try {
      setLoadingExecute(true);
      setErrorText('');
      const cycle = await resumePendingAgentWorkflow({
        context: {
          currentTab: activeTab,
          colorContext,
          modelingImageContext,
          latestExecuteResult: executeResult,
        },
        clientHandlers: {
          navigateToTab: tab => {
            setTimeout(() => onNavigateTab(tab), 0);
          },
          summarizeCurrentPage: () =>
            buildCurrentPageSummary({
              currentTab: activeTab,
              colorContext,
              modelingImageContext,
              latestPlan: plan,
              latestExecuteResult: executeResult,
            }),
        },
        options: {
          allowConfirmActions: true,
        },
      });
      if (!cycle) {
        setErrorText('当前没有可恢复的工作流');
        return;
      }
      if (cycle.hydratedActions.length > 0) {
        setPlan(prev => (prev ? {...prev, actions: cycle.hydratedActions} : prev));
      }
      applyCycleResult(cycle);
    } catch (error) {
      if (isAgentAuthError(error)) {
        void requestAgentLogin('恢复 Agent 工作流需要登录。登录后可以继续当前工作流。');
      }
      setErrorText(formatApiErrorMessage(error, '恢复执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  const cancelWorkflow = async () => {
    try {
      setLoadingExecute(true);
      const result = await cancelPendingAgentWorkflow();
      if (result) {
        setExecuteResult(result);
      }
      setErrorText('');
    } catch (error) {
      setErrorText(formatApiErrorMessage(error, '取消执行失败'));
    } finally {
      setLoadingExecute(false);
    }
  };

  const triggerQuickExecute = () => {
    clearVoiceError();
    runGoal(prompt, 'text').catch(() => undefined);
  };

  const toVoicePhaseText = (phase: string): string => {
    if (phase === 'listening') {
      return '正在收音';
    }
    if (phase === 'transcribing') {
      return '转写中';
    }
    if (phase === 'error') {
      return '识别异常';
    }
    return '空闲';
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <PageHero
        image={HERO_AGENT}
        title="AI Agent"
        subtitle="计划 → 复核 → 执行"
        variant="editorial"
        overlayStrength="normal"
      />

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="compass" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>任务目标</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipRow}>
          {QUICK_PROMPTS.map(item => (
            <Pressable key={item.label} style={styles.quickChip} onPress={() => setPrompt(item.prompt)}>
              <Icon name={item.icon} size={14} color="#A34A3C" />
              <Text style={styles.quickChipText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.strategyWrap}>
          <Text style={styles.metaLabel}>执行策略</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strategyRow}>
            {STRATEGY_OPTIONS.map(item => {
              const active = executionStrategy === item.value;
              return (
                <Pressable
                  key={item.value}
                  style={[styles.strategyChip, active && styles.strategyChipActive]}
                  onPress={() => setExecutionStrategy(item.value)}>
                  <Text style={[styles.strategyChipTitle, active && styles.strategyChipTitleActive]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.strategyChipDesc, active && styles.strategyChipDescActive]}>
                    {item.description}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          style={[styles.input, styles.promptComposer]}
          multiline
          placeholder="例如：先自动调色，再生成3D模型并准备社区发布草稿"
          placeholderTextColor="rgba(134,112,100,0.7)"
        />
        <View style={styles.actionRow}>
          <PrimaryButton
            label={loadingPlan ? '生成中...' : '生成计划'}
            onPress={createPlan}
            disabled={loadingPlan}
            icon={<Icon name="sparkles-outline" size={15} color="#FFFFFF" />}
          />
          <PrimaryButton
            label={
              loadingExecute
                ? '执行中...'
                : executeResult?.status === 'pending_confirm'
                  ? '确认待执行'
                  : '确认执行'
            }
            onPress={executePlan}
            disabled={!plan || loadingExecute}
            variant="secondary"
            icon={<Icon name="play-outline" size={15} color={semanticColors.text.primary} />}
          />
        </View>
        <View style={styles.actionRow}>
          <PrimaryButton
            label={busy ? '执行中...' : '一句话执行'}
            onPress={triggerQuickExecute}
            disabled={busy}
            variant="secondary"
            icon={<Icon name="flash-outline" size={15} color={semanticColors.text.primary} />}
          />
          <Pressable
            style={[styles.secondaryBtn, styles.voiceActionBtn, recording && styles.voiceBtnActive]}
            onPressIn={onVoicePressIn}
            onPressOut={onVoicePressOut}
            disabled={busy}>
            <Icon name={recording ? 'mic' : 'mic-outline'} size={15} color="#2F2926" />
            <Text style={styles.secondaryBtnText}>{recording ? '松开结束' : '按住说话'}</Text>
          </Pressable>
        </View>
        <Text style={styles.metaText}>
          语音阶段: {toVoicePhaseText(voicePhase)}
          {liveTranscript ? ` | ${liveTranscript}` : ''}
        </Text>
        <Text style={styles.metaText}>
          健康度: planner {agentHealth?.plannerSource || 'hybrid'} | strategy{' '}
          {plan?.strategySource || agentHealth?.strategySource || 'adaptive'} | strictMode{' '}
          {agentCapability?.strictMode ? 'on' : 'unknown'}
        </Text>
        <Text style={styles.metaText}>
          auth {agentCapability?.auth?.required ? 'required' : 'open'} | workflow {latestRunStatusText}
        </Text>
        {pendingWorkflow || persistedRunRef ? (
          <View style={styles.actionRow}>
            <PrimaryButton
              label={loadingExecute ? '恢复中...' : '恢复续跑'}
              onPress={resumeWorkflow}
              disabled={loadingExecute}
              variant="secondary"
              icon={<Icon name="refresh-outline" size={15} color={semanticColors.text.primary} />}
            />
            <PrimaryButton
              label="取消续跑"
              onPress={cancelWorkflow}
              disabled={loadingExecute}
              variant="secondary"
              icon={<Icon name="close-circle-outline" size={15} color={semanticColors.text.primary} />}
            />
          </View>
        ) : null}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="list" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>计划摘要</Text>
        </View>
        <Text style={styles.metaText}>{planStatusText}</Text>
        {plan ? (
          <View style={styles.timelineWrap}>
            {plan.actions.map((action, index) => (
              <View key={action.actionId} style={styles.timelineItem}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot} />
                  {index < plan.actions.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.stepCard}>
                  <View style={styles.stepHead}>
                    <Text style={styles.stepIndex}>步骤 {index + 1}</Text>
                    <Text style={styles.stepOp}>{action.operation}</Text>
                  </View>
                  <Text style={styles.stepDomain}>领域 {action.domain}</Text>
                  <Text style={styles.stepMeta}>
                    风险 {toRiskText(action.riskLevel)} · 需确认 {action.requiresConfirmation ? '是' : '否'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>生成计划后会展示步骤</Text>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="time" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>运行历史</Text>
        </View>
        <Text style={styles.metaText}>
          最近 run: {persistedRunRef?.runId || pendingWorkflow?.workflowRun?.runId || '-'}
        </Text>
        <Text style={styles.metaText}>
          状态: {latestRunStatusText}
          {historyLoading ? ' · 加载中' : ''}
        </Text>
        {runHistory.length ? (
          <View style={styles.timelineWrap}>
            {runHistory.slice(-4).reverse().map(item => (
              <View key={item.id} style={styles.stepCard}>
                <Text style={styles.stepDomain}>
                  {item.type} · {item.status || '-'}
                </Text>
                <Text style={styles.stepMeta}>{item.message || '-'}</Text>
                <Text style={styles.stepMeta}>{item.createdAt}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>暂无持久化运行历史，执行后会展示续跑轨迹。</Text>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconBadge}>
            <Icon name="checkmark-done" size={13} color="#A34A3C" />
          </View>
          <Text style={styles.sectionTitle}>执行结果</Text>
        </View>
        {executeResult ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${executeProgress}%`}]} />
            </View>
            <Text style={styles.progressText}>{executeProgress}%</Text>
          </View>
        ) : null}
        {executeResult ? (
          <View style={styles.timelineWrap}>
            <Text style={styles.metaText}>状态: {toResultStatusText(executeResult.status)}</Text>
            {executeResult.workflowRun ? (
              <Text style={styles.metaText}>
                运行态: {toWorkflowRunStatusText(executeResult.workflowRun.status)} · runId{' '}
                {executeResult.workflowRun.runId}
              </Text>
            ) : null}
            {resultSummaryText ? <Text style={styles.metaText}>{resultSummaryText}</Text> : null}
            {statusPresentation ? <Text style={styles.metaText}>{statusPresentation.statusLine}</Text> : null}
            {workflowProgressText ? (
              <Text style={styles.metaText}>链路进度: {workflowProgressText}</Text>
            ) : null}
            {executeResult.workflowState?.nextRequiredContext ? (
              <Text style={styles.metaText}>
                下一步需要: {toContextLabel(executeResult.workflowState.nextRequiredContext)}
              </Text>
            ) : null}
            {executeResult.resultSummary ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>结果摘要</Text>
                <Text style={styles.stepMeta}>{executeResult.resultSummary.done}</Text>
                <Text style={styles.stepMeta}>{executeResult.resultSummary.why}</Text>
                <Text style={styles.stepMeta}>{executeResult.resultSummary.next}</Text>
              </View>
            ) : null}
            {executeResult.nextAction ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>下一步建议</Text>
                <Text style={styles.stepMeta}>
                  {executeResult.nextAction.label}
                  {executeResult.nextAction.requiredContext
                    ? ` · ${executeResult.nextAction.requiredContext}`
                    : ''}
                </Text>
              </View>
            ) : null}
            {executeResult.clientHandledActions?.length ? (
              <Text style={styles.metaText}>
                客户端补执行: {executeResult.clientHandledActions.length} 项
              </Text>
            ) : null}
            {executeResult.resultCards?.length ? (
              <View style={styles.timelineWrap}>
                <Text style={styles.metaLabel}>结果卡片</Text>
                {executeResult.resultCards.map((card, index) => (
                  <View key={`${card.kind}_${index}`} style={styles.stepCard}>
                    <Text style={styles.stepDomain}>
                      {card.title} · {card.status}
                    </Text>
                    <Text style={styles.stepMeta}>{card.summary}</Text>
                    {card.nextAction?.label ? (
                      <Text style={styles.stepMeta}>建议: {String(card.nextAction.label)}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            {executeResult.toolCalls?.length ? (
              <View style={styles.timelineWrap}>
                <Text style={styles.metaLabel}>工具调用摘要</Text>
                {executeResult.toolCalls.slice(0, 4).map(item => (
                  <View key={`${item.actionId}_${item.requestId}`} style={styles.stepCard}>
                    <Text style={styles.stepDomain}>
                      {item.toolName} · {item.status}
                    </Text>
                    <Text style={styles.stepMeta}>
                      server {item.serverId} · {item.latencyMs}ms
                      {item.errorCode ? ` · ${item.errorCode}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {executeResult.pageSummary ? (
              <View style={styles.stepCard}>
                <Text style={styles.stepDomain}>当前页摘要</Text>
                <Text style={styles.stepMeta}>{executeResult.pageSummary}</Text>
              </View>
            ) : null}
            {executeResult.actionResults.map((result, index) => (
              <View key={result.action.actionId} style={styles.timelineItem}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot} />
                  {index < executeResult.actionResults.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.stepCard}>
                  <Text style={styles.stepDomain}>
                    {result.action.domain} · {result.action.operation}
                  </Text>
                  <Text style={styles.stepMeta}>
                    {toActionStatusText(result.status)} {result.errorCode ? `（${result.errorCode}）` : ''}
                  </Text>
                  <Text style={styles.stepMeta}>{result.message}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metaText}>等待执行</Text>
        )}
        {errorText ? <Text style={styles.errorText}>错误: {errorText}</Text> : null}
        {missingContextGuides[0] ? (
          <PrimaryButton
            label={toJumpButtonText(missingContextGuides[0])}
            onPress={() => onNavigateTab(missingContextGuides[0].targetTab)}
            variant="secondary"
            icon={<Icon name="arrow-forward-circle-outline" size={15} color={semanticColors.text.primary} />}
          />
        ) : null}
        <Text style={styles.metaText}>
          严格模式: {agentCapability?.strictMode ? '开启' : '未知'} | 认证:{' '}
          {agentCapability?.auth?.required ? 'JWT' : '无'} | plannerSource{' '}
          {plan?.plannerSource || agentHealth?.plannerSource || '-'} | strategySource{' '}
          {plan?.strategySource || agentHealth?.strategySource || '-'}
        </Text>
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {gap: 14, paddingBottom: 24},
  card: {
    ...cardSurfaceViolet,
    ...glassShadow,
    gap: 12,
  },
  sectionTitle: {
    ...canvasText.sectionTitle,
    color: '#2F2926',
  },
  sectionHead: {
    ...canvasUi.titleWithIcon,
  },
  sectionIconBadge: {
    ...canvasUi.iconBadge,
  },
  input: {
    ...canvasUi.input,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    color: '#2F2926',
    ...canvasText.body,
  },
  promptComposer: {
    minHeight: 132,
  },
  quickChipRow: {
    gap: 8,
    paddingRight: 10,
  },
  quickChip: {
    ...canvasUi.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickChipText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  strategyWrap: {
    gap: 8,
  },
  strategyRow: {
    gap: 8,
    paddingRight: 12,
  },
  strategyChip: {
    minWidth: 120,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(163,74,60,0.12)',
    gap: 4,
  },
  strategyChipActive: {
    backgroundColor: 'rgba(163,74,60,0.14)',
    borderColor: 'rgba(163,74,60,0.28)',
  },
  strategyChipTitle: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  strategyChipTitleActive: {
    color: '#8D3F33',
  },
  strategyChipDesc: {
    ...canvasText.caption,
    color: 'rgba(110,90,80,0.82)',
  },
  strategyChipDescActive: {
    color: '#8D3F33',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    ...canvasUi.primaryButton,
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#FFF6F2',
  },
  secondaryBtn: {
    ...canvasUi.secondaryButton,
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  voiceActionBtn: {
    borderRadius: 20,
  },
  voiceBtnActive: {
    opacity: 0.84,
  },
  secondaryBtnText: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  timelineWrap: {
    gap: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: semanticColors.accent.primary,
    marginTop: 12,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 6,
    backgroundColor: 'rgba(203,213,225,0.8)',
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    ...canvasUi.progressTrack,
    flex: 1,
  },
  progressFill: {
    ...canvasUi.progressFill,
  },
  progressText: {
    ...canvasText.caption,
    color: '#A34A3C',
    minWidth: 32,
    textAlign: 'right',
  },
  stepCard: {
    ...canvasUi.subtleCard,
    flex: 1,
    borderRadius: 20,
    padding: 14,
    gap: 5,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepIndex: {
    ...canvasText.caption,
    color: '#A34A3C',
  },
  stepDomain: {
    ...canvasText.bodyStrong,
    color: '#2F2926',
  },
  stepOp: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
  },
  stepMeta: {
    ...canvasText.bodyMuted,
    color: 'rgba(110,90,80,0.82)',
    lineHeight: 16,
  },
  metaText: {
    ...canvasText.body,
    color: 'rgba(110,90,80,0.82)',
    lineHeight: 18,
  },
  metaLabel: {
    ...canvasText.caption,
    color: '#A34A3C',
  },
  errorText: {
    ...canvasText.body,
    color: '#C35B63',
  },
});

