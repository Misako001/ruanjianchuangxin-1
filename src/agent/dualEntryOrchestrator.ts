import {
  agentApi,
  colorApi,
  communityApi,
  type AgentExecuteResponse,
  type AgentPlanAction,
  type AgentPlanResponse,
  type AgentWorkflowRunState,
  type ColorRequestContext,
} from '../modules/api';
import {exportGradedResult} from '../colorEngine/exportService';
import {applyVoiceInterpretation, formatInterpretationSummary} from '../voice/paramApplier';
import type {InterpretResponse} from '../voice/types';
import {useAgentExecutionContextStore, type AgentModelingImageContext} from './executionContextStore';
import {useAgentWorkflowContinuationStore} from './workflowContinuationStore';

export type AgentClientTab = 'create' | 'model' | 'agent' | 'community' | 'profile';
export type AgentExecutionStrategy = 'adaptive' | 'fast' | 'quality' | 'cost';

export interface AgentExecutionContextInput {
  currentTab: AgentClientTab;
  colorContext: ColorRequestContext | null;
  modelingImageContext: AgentModelingImageContext | null;
  latestExecuteResult: AgentExecuteResponse | null;
}

export interface MissingContextGuide {
  operation: 'grading.apply_visual_suggest' | 'convert.start_task';
  targetTab: AgentClientTab;
  message: string;
}

export interface AgentExecuteCycleOptions {
  allowConfirmActions?: boolean;
  actionIds?: string[];
  executionStrategy?: AgentExecutionStrategy;
}

export interface AgentGoalCycleOptions extends AgentExecuteCycleOptions {
  inputSource?: 'text' | 'voice';
}

interface AgentExecuteClientHandlers {
  navigateToTab: (tab: AgentClientTab) => void;
  summarizeCurrentPage: () => string;
}

interface ClientHandledActionResult {
  status: 'applied' | 'failed';
  message: string;
  errorCode?: string;
  output?: Record<string, unknown>;
  pageSummary?: string;
}

interface ClientExecutionSharedState {
  latestColorContext: ColorRequestContext | null;
  latestInterpretation: InterpretResponse | null;
  latestDraftId: string;
}

const WAITING_WORKFLOW_RUN_STATUSES = new Set<NonNullable<AgentWorkflowRunState['status']>>([
  'waiting_context',
  'waiting_async_result',
  'waiting_confirm',
  'running',
]);

const toBackendExecutionStrategy = (
  value?: AgentExecutionStrategy,
): 'fast' | 'quality' | 'cost' | undefined => {
  if (!value || value === 'adaptive') {
    return undefined;
  }
  return value;
};

const buildExecuteIdempotencyKey = (input: {
  planId: string;
  actionIds: string[];
  allowConfirmActions: boolean;
  latestExecutionId: string;
}): string => {
  const mode = input.allowConfirmActions ? 'confirm' : 'auto';
  const actionIds = input.actionIds.join(',');
  const seed = input.latestExecutionId || 'root';
  return `${input.planId}:${mode}:${actionIds}:${seed}`;
};

export interface AgentExecuteCycleResult {
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  executedActionIds: string[];
  executeResult: AgentExecuteResponse | null;
}

const hasGradingArgs = (args?: Record<string, unknown>): boolean => {
  if (!args || typeof args !== 'object') {
    return false;
  }
  const image = args.image as Record<string, unknown> | undefined;
  return Boolean(
    typeof args.locale === 'string' &&
      args.locale &&
      args.currentParams &&
      image &&
      typeof image.mimeType === 'string' &&
      image.mimeType &&
      Number.isFinite(Number(image.width)) &&
      Number.isFinite(Number(image.height)) &&
      typeof image.base64 === 'string' &&
      image.base64,
  );
};

const hasConvertArgs = (args?: Record<string, unknown>): boolean => {
  if (!args || typeof args !== 'object') {
    return false;
  }
  const image = args.image as Record<string, unknown> | undefined;
  return Boolean(
    image &&
      typeof image.mimeType === 'string' &&
      image.mimeType &&
      typeof image.fileName === 'string' &&
      image.fileName &&
      typeof image.base64 === 'string' &&
      image.base64,
  );
};

export const resolveDraftIdFromExecuteResult = (result: AgentExecuteResponse | null): string => {
  if (!result || !Array.isArray(result.actionResults)) {
    return '';
  }
  for (const item of result.actionResults) {
    if (
      item.status !== 'applied' ||
      item.action?.domain !== 'community' ||
      item.action?.operation !== 'create_draft'
    ) {
      continue;
    }
    const output = item.output as {draftId?: string | number} | undefined;
    if (output?.draftId !== undefined && output?.draftId !== null) {
      const normalized = String(output.draftId).trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return '';
};

const pushMissingGuide = (
  guides: MissingContextGuide[],
  next: MissingContextGuide,
): MissingContextGuide[] => {
  if (guides.some(item => item.operation === next.operation)) {
    return guides;
  }
  return [...guides, next];
};

const hydratePlanActions = (
  actions: AgentPlanAction[],
  context: AgentExecutionContextInput,
): {
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  missingActionIds: string[];
} => {
  let missingContextGuides: MissingContextGuide[] = [];
  const missingActionIds: string[] = [];
  const latestDraftId = resolveDraftIdFromExecuteResult(context.latestExecuteResult);
  const hydratedActions = actions.map(action => {
    if (action.domain === 'grading' && action.operation === 'apply_visual_suggest') {
      if (hasGradingArgs(action.args)) {
        return action;
      }
      if (!context.colorContext) {
        missingActionIds.push(action.actionId);
        missingContextGuides = pushMissingGuide(missingContextGuides, {
          operation: 'grading.apply_visual_suggest',
          targetTab: 'create',
          message: '缺少调色图片上下文，请先到调色页选择图片。',
        });
        return action;
      }
      return {
        ...action,
        args: {
          locale: context.colorContext.locale,
          currentParams: context.colorContext.currentParams,
          image: context.colorContext.image,
          imageStats: context.colorContext.imageStats,
        },
      };
    }

    if (action.domain === 'convert' && action.operation === 'start_task') {
      if (hasConvertArgs(action.args)) {
        return action;
      }
      if (!context.modelingImageContext?.image) {
        missingActionIds.push(action.actionId);
        missingContextGuides = pushMissingGuide(missingContextGuides, {
          operation: 'convert.start_task',
          targetTab: 'model',
          message: '缺少建模图片上下文，请先到建模页选择图片。',
        });
        return action;
      }
      return {
        ...action,
        args: {
          image: context.modelingImageContext.image,
        },
      };
    }

    if (action.domain === 'community' && action.operation === 'publish_draft') {
      const args = action.args && typeof action.args === 'object' ? action.args : {};
      const draftIdRaw = (args as {draftId?: string | number}).draftId;
      const hasDraftId =
        draftIdRaw !== undefined && draftIdRaw !== null && String(draftIdRaw).trim().length > 0;
      if (!hasDraftId && latestDraftId) {
        return {
          ...action,
          args: {
            ...args,
            draftId: latestDraftId,
          },
        };
      }
    }

    return action;
  });

  return {
    hydratedActions,
    missingContextGuides,
    missingActionIds,
  };
};

const toTabLabel = (tab: AgentClientTab): string => {
  if (tab === 'create') {
    return '调色页';
  }
  if (tab === 'model') {
    return '建模页';
  }
  if (tab === 'community') {
    return '社区页';
  }
  if (tab === 'profile') {
    return '我的页';
  }
  return '助手页';
};

export const buildMissingContextHintText = (guides: MissingContextGuide[]): string => {
  if (!guides.length) {
    return '';
  }
  if (guides.length === 1) {
    return guides[0].message;
  }
  return `执行前缺少上下文：${guides.map(item => item.operation).join('、')}。请先补齐图片后重试。`;
};

const toMissingContextKey = (guide: MissingContextGuide | undefined): string | null => {
  if (!guide) {
    return null;
  }
  if (guide.operation === 'grading.apply_visual_suggest') {
    return 'context.color.image';
  }
  if (guide.operation === 'convert.start_task') {
    return 'context.modeling.image';
  }
  return null;
};

const resolvePendingActionIds = (
  plan: AgentPlanResponse,
  context: AgentExecutionContextInput,
  options?: AgentExecuteCycleOptions,
): string[] => {
  if (Array.isArray(options?.actionIds) && options.actionIds.length > 0) {
    return options.actionIds;
  }
  const latest = context.latestExecuteResult;
  if (!latest || latest.planId !== plan.planId) {
    return plan.actions.map(item => item.actionId);
  }
  const statusByActionId = new Map(
    (latest.actionResults || []).map(item => [item.action.actionId, item.status]),
  );
  const remaining = plan.actions
    .filter(action => {
      const status = statusByActionId.get(action.actionId);
      return status !== 'applied' && status !== 'skipped';
    })
    .map(action => action.actionId);
  return remaining.length > 0 ? remaining : plan.actions.map(item => item.actionId);
};

const resolveNavigationTarget = (args?: Record<string, unknown>): AgentClientTab => {
  const tabRaw = String(args?.tab || args?.mainTab || '').trim().toLowerCase();
  const routeRaw = String(args?.route || args?.homeRoute || '').trim().toLowerCase();

  if (tabRaw === 'community') {
    return 'community';
  }
  if (tabRaw === 'profile') {
    return 'profile';
  }
  if (tabRaw === 'agent' || tabRaw === 'assistant') {
    return 'agent';
  }
  if (tabRaw === 'model') {
    return 'model';
  }
  if (tabRaw === 'create' || tabRaw === 'home') {
    if (routeRaw.includes('model')) {
      return 'model';
    }
    return 'create';
  }
  if (routeRaw.includes('model')) {
    return 'model';
  }
  if (routeRaw.includes('community')) {
    return 'community';
  }
  if (routeRaw.includes('profile') || routeRaw.includes('setting')) {
    return 'profile';
  }
  return 'agent';
};

export const areMissingContextGuidesResolved = (
  guides: MissingContextGuide[],
  context: Pick<AgentExecutionContextInput, 'colorContext' | 'modelingImageContext'>,
): boolean => {
  if (!guides.length) {
    return false;
  }
  return guides.every(guide => {
    if (guide.operation === 'grading.apply_visual_suggest') {
      return Boolean(context.colorContext?.image?.base64);
    }
    if (guide.operation === 'convert.start_task') {
      return Boolean(context.modelingImageContext?.image?.base64);
    }
    return true;
  });
};

export const buildCurrentPageSummary = (input: {
  currentTab: AgentClientTab;
  colorContext: ColorRequestContext | null;
  modelingImageContext: AgentModelingImageContext | null;
  latestPlan: AgentPlanResponse | null;
  latestExecuteResult: AgentExecuteResponse | null;
}): string => {
  const tabText = toTabLabel(input.currentTab);
  const pieces: string[] = [`当前页面：${tabText}`];
  if (input.currentTab === 'create') {
    pieces.push(input.colorContext ? '已加载调色图片上下文' : '未加载调色图片上下文');
  }
  if (input.currentTab === 'model') {
    pieces.push(input.modelingImageContext?.image ? '已加载建模图片上下文' : '未加载建模图片上下文');
  }
  if (input.latestPlan) {
    pieces.push(`最近计划步骤数：${input.latestPlan.actions.length}`);
  }
  if (input.latestExecuteResult) {
    pieces.push(`最近执行状态：${input.latestExecuteResult.status}`);
  }
  return pieces.join('；');
};

type ClientActionHandler = (input: {
  item: AgentExecuteResponse['actionResults'][number];
  handlers: AgentExecuteClientHandlers;
  sharedState: ClientExecutionSharedState;
}) => Promise<ClientHandledActionResult>;

const normalizeTagList = (value: unknown): string[] =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);

const buildCommunityDraftContent = (
  args: Record<string, unknown>,
  interpretation: InterpretResponse | null,
): string => {
  const customContent = typeof args.content === 'string' ? args.content.trim() : '';
  if (customContent) {
    return customContent.slice(0, 4000);
  }
  const lines = [
    interpretation?.analysisSummary ? `分析：${interpretation.analysisSummary}` : '',
    interpretation?.appliedProfile ? `风格：${interpretation.appliedProfile}` : '',
    interpretation?.sceneProfile ? `场景：${interpretation.sceneProfile}` : '',
    interpretation?.reasoningSummary ? `说明：${interpretation.reasoningSummary}` : '',
  ].filter(Boolean);
  return (lines.join('\n') || 'AI Agent 已自动完成调色并同步社区草稿。').slice(0, 4000);
};

const buildCommunityDraftTags = (
  args: Record<string, unknown>,
  interpretation: InterpretResponse | null,
): string[] =>
  normalizeTagList([
    ...normalizeTagList(args.tags),
    'AI助手',
    interpretation?.appliedProfile || '',
    interpretation?.sceneProfile || '',
  ]);

const buildCommunityDraftTitle = (
  args: Record<string, unknown>,
  interpretation: InterpretResponse | null,
): string => {
  const customTitle = typeof args.title === 'string' ? args.title.trim() : '';
  if (customTitle) {
    return customTitle.slice(0, 120);
  }
  const profile = interpretation?.appliedProfile || interpretation?.sceneProfile || '调色作品';
  return `${profile} · AI 自动发布`.slice(0, 120);
};

const exportColorResultForAgent = async (context: ColorRequestContext): Promise<string> => {
  if (!context.sourceUri) {
    throw new Error('当前调色上下文缺少原图路径，请先回到创作页重新选择图片。');
  }
  if (!context.workingSpaceHint) {
    throw new Error('当前调色上下文缺少原生导出信息，请先在创作页重新选择图片后再执行。');
  }
  const exported = await exportGradedResult({
    targetRef: null,
    spec: {
      format: 'png16',
      quality: 1,
      sourcePolicy: 'original_only',
      bitDepth: 16,
      embedMetadata: true,
    },
    params: context.currentParams,
    metadata: {
      sourceUri: context.sourceUri,
      nativeSourcePath: context.nativeSourcePath,
      isRawSource: context.isRaw,
      sourceBitDepth: context.bitDepthHint,
      workingSpace: context.workingSpaceHint,
    },
  });
  return exported.uri;
};

const CLIENT_REQUIRED_HANDLERS: Record<string, ClientActionHandler> = {
  'navigation.navigate_tab': async ({item, handlers}) => {
    const targetTab = resolveNavigationTarget(item.action.args);
    handlers.navigateToTab(targetTab);
    return {
      status: 'applied',
      message: `客户端已完成跳转：${toTabLabel(targetTab)}`,
      output: {
        ...(item.output || {}),
        targetTab,
        clientHandled: true,
      },
    };
  },
  'app.summarize_current_page': async ({item, handlers}) => {
    const summary = handlers.summarizeCurrentPage().trim();
    if (!summary) {
      return {
        status: 'failed',
        message: '客户端未能生成当前页摘要',
        errorCode: 'tool_error',
      };
    }
    return {
      status: 'applied',
      message: summary,
      output: {
        ...(item.output || {}),
        summary,
        clientHandled: true,
      },
      pageSummary: summary,
    };
  },
  'grading.apply_visual_suggest': async ({item, sharedState}) => {
    const fallbackContext = useAgentExecutionContextStore.getState().colorContext;
    const baseContext = sharedState.latestColorContext || fallbackContext;
    if (!baseContext) {
      return {
        status: 'failed',
        message: '缺少调色图片上下文，请先在创作页选择图片。',
        errorCode: 'missing_context',
      };
    }
    const interpretation = await colorApi.initialSuggest(baseContext);
    const nextColorContext: ColorRequestContext = {
      ...baseContext,
      currentParams: applyVoiceInterpretation(baseContext.currentParams, interpretation),
    };
    sharedState.latestColorContext = nextColorContext;
    sharedState.latestInterpretation = interpretation;
    useAgentExecutionContextStore.getState().setColorContext(nextColorContext);
    return {
      status: 'applied',
      message: interpretation.analysisSummary || formatInterpretationSummary(interpretation),
      output: {
        ...(item.output || {}),
        confidence: interpretation.confidence,
        actionsCount: Array.isArray(interpretation.actions) ? interpretation.actions.length : 0,
        appliedProfile: interpretation.appliedProfile || '',
        sceneProfile: interpretation.sceneProfile || '',
        analysisSummary: interpretation.analysisSummary || '',
        clientHandled: true,
      },
    };
  },
  'community.create_draft': async ({item, sharedState}) => {
    const colorContext = sharedState.latestColorContext || useAgentExecutionContextStore.getState().colorContext;
    if (!colorContext?.sourceUri) {
      return {
        status: 'failed',
        message: '缺少可发布的图片素材，请先在创作页选择图片后再执行。',
        errorCode: 'missing_context',
      };
    }

    const args = item.action.args && typeof item.action.args === 'object' ? item.action.args : {};
    const interpretation = sharedState.latestInterpretation;
    const beforeUploaded = await communityApi.uploadPostImage({
      uri: colorContext.sourceUri,
      name: colorContext.fileName || 'before-image.jpg',
      type: colorContext.image.mimeType || 'image/jpeg',
    });
    const exportedAfterUri = await exportColorResultForAgent(colorContext);
    const afterUploaded = await communityApi.uploadPostImage({
      uri: exportedAfterUri,
      name: `graded-${colorContext.fileName || 'image'}.png`,
      type: 'image/png',
    });
    const created = await communityApi.createDraft({
      title: buildCommunityDraftTitle(args, interpretation),
      content: buildCommunityDraftContent(args, interpretation),
      tags: buildCommunityDraftTags(args, interpretation),
      beforeUrl: beforeUploaded.url,
      afterUrl: afterUploaded.url,
      gradingParams: colorContext.currentParams as unknown as Record<string, unknown>,
    });
    sharedState.latestDraftId = created.id;
    return {
      status: 'applied',
      message: '客户端已创建社区草稿并同步调色结果。',
      output: {
        ...(item.output || {}),
        draftId: created.id,
        beforeUrl: created.beforeUrl,
        afterUrl: created.afterUrl,
        clientHandled: true,
      },
    };
  },
  'community.publish_draft': async ({item, sharedState}) => {
    const args = item.action.args && typeof item.action.args === 'object' ? item.action.args : {};
    const candidateDraftId =
      (args.draftId !== undefined && args.draftId !== null ? String(args.draftId).trim() : '') ||
      sharedState.latestDraftId ||
      '';
    if (!candidateDraftId) {
      return {
        status: 'failed',
        message: '缺少社区草稿，无法发布。',
        errorCode: 'missing_context',
      };
    }
    const published = await communityApi.publishDraft(candidateDraftId);
    return {
      status: 'applied',
      message: '客户端已将调色结果发布到社区。',
      output: {
        ...(item.output || {}),
        draftId: candidateDraftId,
        postId: published.id,
        clientHandled: true,
      },
    };
  },
};

export const applyClientRequiredActions = async (
  result: AgentExecuteResponse,
  handlers: AgentExecuteClientHandlers,
): Promise<AgentExecuteResponse> => {
  if (!Array.isArray(result.actionResults) || result.actionResults.length === 0) {
    return result;
  }

  const clientHandledActions: NonNullable<AgentExecuteResponse['clientHandledActions']> = [];
  let summaryText = '';
  const sharedState: ClientExecutionSharedState = {
    latestColorContext: useAgentExecutionContextStore.getState().colorContext,
    latestInterpretation: null,
    latestDraftId: resolveDraftIdFromExecuteResult(result),
  };
  const actionResults: AgentExecuteResponse['actionResults'] = [];

  for (const item of result.actionResults) {
    if (item.status !== 'client_required') {
      actionResults.push(item);
      continue;
    }
    const key = `${item.action.domain}.${item.action.operation}`;
    const handler = CLIENT_REQUIRED_HANDLERS[key];
    if (!handler) {
      actionResults.push(item);
      continue;
    }
    const handled = await handler({item, handlers, sharedState});
    if (handled.pageSummary) {
      summaryText = handled.pageSummary;
    }
    clientHandledActions.push({
      actionId: item.action.actionId,
      domain: item.action.domain,
      operation: item.action.operation,
      message: handled.message,
      output: handled.output,
    });

    actionResults.push({
      ...item,
      status: handled.status,
      message: handled.message,
      errorCode: handled.errorCode,
      output: handled.output ?? item.output,
    });
  }

  const hasPendingConfirm = actionResults.some(item => item.status === 'pending_confirm');
  const hasFailed = actionResults.some(item => item.status === 'failed');
  const hasClientRequired = actionResults.some(item => item.status === 'client_required');
  const status: AgentExecuteResponse['status'] = hasPendingConfirm
    ? 'pending_confirm'
    : hasFailed
      ? 'failed'
      : hasClientRequired
        ? 'client_required'
        : 'applied';

  return {
    ...result,
    status,
    actionResults,
    clientHandledActions,
    pageSummary: summaryText || undefined,
  };
};

export const toResultStatusText = (status: AgentExecuteResponse['status']): string => {
  switch (status) {
    case 'applied':
      return '已应用';
    case 'failed':
      return '执行失败';
    case 'pending_confirm':
      return '待确认';
    case 'client_required':
      return '需客户端处理';
    default:
      return status || '-';
  }
};

export const toActionStatusText = (status: string): string => {
  switch (status) {
    case 'applied':
      return '已完成';
    case 'failed':
      return '失败';
    case 'pending_confirm':
      return '待确认';
    case 'client_required':
      return '客户端已处理';
    case 'skipped':
      return '已跳过';
    default:
      return status || '-';
  }
};

const withWorkflowStateHint = (
  result: AgentExecuteResponse,
  hints: {
    nextRequiredContext?: string | null;
    totalSteps?: number;
    currentStep?: number;
  } = {},
): AgentExecuteResponse => {
  const baseState = result.workflowState || {
    currentStep: 0,
    totalSteps: hints.totalSteps || 0,
    nextRequiredContext: null,
  };
  return {
    ...result,
    workflowState: {
      currentStep:
        typeof hints.currentStep === 'number' ? hints.currentStep : baseState.currentStep,
      totalSteps: typeof hints.totalSteps === 'number' ? hints.totalSteps : baseState.totalSteps,
      nextRequiredContext:
        hints.nextRequiredContext !== undefined
          ? hints.nextRequiredContext
          : baseState.nextRequiredContext ?? null,
    },
  };
};

const persistPendingWorkflow = async (input: {
  plan: AgentPlanResponse;
  hydratedActions: AgentPlanAction[];
  missingContextGuides: MissingContextGuide[];
  latestExecuteResult: AgentExecuteResponse | null;
}): Promise<void> => {
  const workflowRun = input.latestExecuteResult?.workflowRun || null;
  const shouldPersist =
    input.missingContextGuides.length > 0 ||
    (workflowRun?.status ? WAITING_WORKFLOW_RUN_STATUSES.has(workflowRun.status) : false);
  if (!shouldPersist) {
    useAgentWorkflowContinuationStore.getState().clearPendingWorkflow();
    return;
  }
  useAgentWorkflowContinuationStore.getState().setPendingWorkflow({
    plan: {
      ...input.plan,
      actions: input.hydratedActions,
    },
    latestExecuteResult: input.latestExecuteResult,
    missingContextGuides: input.missingContextGuides,
    workflowRun,
  });
  if (
    input.missingContextGuides.length > 0 &&
    input.latestExecuteResult &&
    workflowRun?.status === 'waiting_context'
  ) {
    try {
      const registered = await agentApi.registerWorkflowRun({
        planId: input.plan.planId,
        actions: input.hydratedActions,
        latestExecuteResult: input.latestExecuteResult,
        runId: workflowRun.runId,
      });
      useAgentWorkflowContinuationStore.getState().setPendingWorkflow({
        plan: {
          ...input.plan,
          actions: input.hydratedActions,
        },
        latestExecuteResult: registered,
        missingContextGuides: input.missingContextGuides,
        workflowRun: registered.workflowRun || null,
      });
    } catch {
      // local persistence is enough when backend run registration is unavailable
    }
  }
};

const buildBlockedExecutionResult = (input: {
  planId: string;
  hydratedActions: AgentPlanAction[];
  missingActionIds: string[];
  missingContextGuides: MissingContextGuide[];
}): AgentExecuteResponse => {
  const actionById = new Map(input.hydratedActions.map(item => [item.actionId, item]));
  const operationMessageMap = new Map(
    input.missingContextGuides.map(item => [item.operation, item.message]),
  );
  const actionResults = input.missingActionIds
    .map(actionId => actionById.get(actionId))
    .filter((item): item is AgentPlanAction => Boolean(item))
    .map(action => {
      const operationKey = `${action.domain}.${action.operation}` as MissingContextGuide['operation'];
      return {
        status: 'client_required',
        message: operationMessageMap.get(operationKey) || '缺少上下文，请补齐后继续执行。',
        errorCode: 'client_required',
        action,
      };
    });
  const blockedIndex = input.hydratedActions.findIndex(action =>
    input.missingActionIds.includes(action.actionId),
  );
  return {
    executionId: `blocked_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    planId: input.planId,
    status: 'client_required',
    workflowRun: {
      runId: `blocked_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      status: 'waiting_context',
      currentStep: blockedIndex >= 0 ? blockedIndex + 1 : 1,
      totalSteps: input.hydratedActions.length,
      nextRequiredContext: toMissingContextKey(input.missingContextGuides[0]),
      blockedReason: 'waiting_context',
      updatedAt: new Date().toISOString(),
      waitingActionId: input.missingActionIds[0] || null,
      pendingTask: null,
    },
    workflowState: {
      currentStep: blockedIndex >= 0 ? blockedIndex + 1 : 1,
      totalSteps: input.hydratedActions.length,
      nextRequiredContext: toMissingContextKey(input.missingContextGuides[0]),
    },
    resultCards: input.missingContextGuides.map(guide => ({
      kind: 'context_required',
      title: guide.targetTab === 'model' ? '需要建模图片' : '需要调色图片',
      summary: guide.message,
      status: 'client_required',
      nextAction: {
        type: 'navigate',
        tab: guide.targetTab,
        label: guide.targetTab === 'model' ? '去建模页补图' : '去调色页补图',
      },
    })),
    actionResults,
  };
};

export const toWorkflowRunStatusText = (status?: AgentWorkflowRunState['status'] | null): string => {
  switch (status) {
    case 'queued':
      return '已排队';
    case 'running':
      return '运行中';
    case 'waiting_context':
      return '等待上下文';
    case 'waiting_confirm':
      return '等待确认';
    case 'waiting_async_result':
      return '后台处理中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'partial_succeeded':
      return '部分完成';
    default:
      return status || '-';
  }
};

export const buildExecuteStatusPresentation = (
  result: AgentExecuteResponse,
): {
  statusLine: string;
  assistantReply: string;
} => {
  const nextLabel =
    typeof result.nextAction?.label === 'string' && result.nextAction.label.trim()
      ? result.nextAction.label.trim()
      : '';
  const summaryDone = result.resultSummary?.done || '';
  const summaryNext = result.resultSummary?.next || '';
  if (result.status === 'pending_confirm') {
    return {
      statusLine: '已执行可用步骤，等待确认。',
      assistantReply: nextLabel
        ? `我已完成可执行步骤，下一步请${nextLabel}。`
        : '我已完成可执行步骤，下一步请确认后继续。',
    };
  }
  if (result.status === 'waiting_async_result') {
    return {
      statusLine: '长任务已进入后台处理。',
      assistantReply: nextLabel
        ? `任务已进入后台处理，下一步请${nextLabel}。`
        : '任务已进入后台处理，我会继续自动续跑。',
    };
  }
  if (result.status === 'client_required') {
    return {
      statusLine: '需要补齐上下文或权限。',
      assistantReply: nextLabel
        ? `当前仍需客户端动作，下一步请${nextLabel}。`
        : summaryNext || '当前仍需客户端动作，完成后将自动续跑。',
    };
  }
  if (result.status === 'failed') {
    return {
      statusLine: '执行未完成。',
      assistantReply: nextLabel
        ? `执行未完成，建议先${nextLabel}。`
        : summaryNext || '执行未完成，可重试或补齐上下文后继续。',
    };
  }
  return {
    statusLine: '执行完成。',
    assistantReply: summaryDone ? `${summaryDone}${summaryNext ? ` ${summaryNext}` : ''}` : '执行完成。',
  };
};

export const executeAgentPlanCycle = async (input: {
  plan: AgentPlanResponse;
  context: AgentExecutionContextInput;
  clientHandlers: AgentExecuteClientHandlers;
  options?: AgentExecuteCycleOptions;
}): Promise<AgentExecuteCycleResult> => {
  const {hydratedActions, missingContextGuides, missingActionIds} = hydratePlanActions(
    input.plan.actions,
    input.context,
  );
  const candidateActionIds = resolvePendingActionIds(
    {
      ...input.plan,
      actions: hydratedActions,
    },
    input.context,
    input.options,
  );
  const actionIndexById = new Map(
    hydratedActions.map((item, index) => [item.actionId, index]),
  );
  let executableActionIds = candidateActionIds;
  if (missingActionIds.length > 0) {
    const firstBlockedIndex = Math.min(
      ...missingActionIds
        .map(actionId => actionIndexById.get(actionId))
        .filter((value): value is number => typeof value === 'number'),
    );
    if (Number.isFinite(firstBlockedIndex)) {
      executableActionIds = candidateActionIds.filter(actionId => {
        const index = actionIndexById.get(actionId);
        return typeof index === 'number' && index < firstBlockedIndex;
      });
    }
  }

  if (executableActionIds.length === 0) {
    if (missingContextGuides.length > 0 && missingContextGuides[0]) {
      input.clientHandlers.navigateToTab(missingContextGuides[0].targetTab);
      const blockedResult = buildBlockedExecutionResult({
        planId: input.plan.planId,
        hydratedActions,
        missingActionIds,
        missingContextGuides,
      });
      await persistPendingWorkflow({
        plan: input.plan,
        hydratedActions,
        missingContextGuides,
        latestExecuteResult: blockedResult,
      });
      return {
        hydratedActions,
        missingContextGuides,
        executedActionIds: [],
        executeResult: blockedResult,
      };
    }
    useAgentWorkflowContinuationStore.getState().clearPendingWorkflow();
    return {
      hydratedActions,
      missingContextGuides,
      executedActionIds: [],
      executeResult: null,
    };
  }

  const executeResult = await agentApi.executePlan(input.plan.planId, hydratedActions, {
    actionIds: executableActionIds,
    allowConfirmActions: input.options?.allowConfirmActions === true,
    executionStrategy: toBackendExecutionStrategy(input.options?.executionStrategy),
    idempotencyKey: buildExecuteIdempotencyKey({
      planId: input.plan.planId,
      actionIds: executableActionIds,
      allowConfirmActions: input.options?.allowConfirmActions === true,
      latestExecutionId: input.context.latestExecuteResult?.executionId || '',
    }),
  });
  let normalizedResult = await applyClientRequiredActions(executeResult, input.clientHandlers);
  if (missingContextGuides.length > 0) {
    if (missingContextGuides[0]) {
      input.clientHandlers.navigateToTab(missingContextGuides[0].targetTab);
    }
    const firstGuide = missingContextGuides[0];
    const nextRequiredContext = toMissingContextKey(firstGuide);
    const blockedIndex = actionIndexById.get(missingActionIds[0]);
    normalizedResult = withWorkflowStateHint(normalizedResult, {
      nextRequiredContext,
      totalSteps: hydratedActions.length,
      currentStep:
        typeof blockedIndex === 'number'
          ? Math.max(1, blockedIndex + 1)
          : normalizedResult.workflowState?.currentStep || 1,
    });
  } else {
    normalizedResult = withWorkflowStateHint(normalizedResult, {
      totalSteps: hydratedActions.length,
    });
  }
  await persistPendingWorkflow({
    plan: input.plan,
    hydratedActions,
    missingContextGuides,
    latestExecuteResult: normalizedResult,
  });
  return {
    hydratedActions,
    missingContextGuides,
    executedActionIds: executableActionIds,
    executeResult: normalizedResult,
  };
};

export const runAgentGoalCycle = async (input: {
  goal: string;
  context: AgentExecutionContextInput;
  clientHandlers: AgentExecuteClientHandlers;
  options?: AgentGoalCycleOptions;
}): Promise<{
  plan: AgentPlanResponse;
  cycle: AgentExecuteCycleResult;
}> => {
  const plan = await agentApi.createPlan(
    input.goal,
    input.context.currentTab,
    input.options?.inputSource === 'voice' ? 'voice' : 'text',
    toBackendExecutionStrategy(input.options?.executionStrategy),
  );
  const cycle = await executeAgentPlanCycle({
    plan,
    context: input.context,
    clientHandlers: input.clientHandlers,
    options: input.options,
  });
  return {
    plan,
    cycle,
  };
};

export const resumePendingAgentWorkflow = async (input: {
  context: AgentExecutionContextInput;
  clientHandlers: AgentExecuteClientHandlers;
  options?: {
    allowConfirmActions?: boolean;
  };
}): Promise<AgentExecuteCycleResult | null> => {
  const workflowStore = useAgentWorkflowContinuationStore.getState();
  const pendingWorkflow = workflowStore.pendingWorkflow;
  const persistedRunRef = workflowStore.persistedRunRef;
  const resumeRunId =
    pendingWorkflow?.workflowRun?.runId ||
    input.context.latestExecuteResult?.workflowRun?.runId ||
    persistedRunRef?.runId ||
    '';

  if (resumeRunId) {
    try {
      const resumed = await applyClientRequiredActions(
        await agentApi.resumeWorkflowRun(resumeRunId, {
          allowConfirmActions: input.options?.allowConfirmActions === true,
          contextPatch: {
            colorContext: input.context.colorContext,
            modelingImageContext: input.context.modelingImageContext,
          },
        }),
        input.clientHandlers,
      );
      if (pendingWorkflow) {
        await persistPendingWorkflow({
          plan: pendingWorkflow.plan,
          hydratedActions: pendingWorkflow.plan.actions,
          missingContextGuides: pendingWorkflow.missingContextGuides,
          latestExecuteResult: resumed,
        });
      } else if (resumed.workflowRun?.status) {
        if (WAITING_WORKFLOW_RUN_STATUSES.has(resumed.workflowRun.status)) {
          workflowStore.setPersistedRunRef({
            runId: resumed.workflowRun.runId,
            planId: resumed.planId,
            status: resumed.workflowRun.status,
            updatedAt: Date.now(),
          });
        } else {
          workflowStore.setPersistedRunRef(null);
        }
      }
      return {
        hydratedActions: pendingWorkflow?.plan.actions || [],
        missingContextGuides: pendingWorkflow?.missingContextGuides || [],
        executedActionIds: [],
        executeResult: resumed,
      };
    } catch {
      // fall back to local continuation below
    }
  }

  if (!pendingWorkflow) {
    return null;
  }

  if (
    !areMissingContextGuidesResolved(pendingWorkflow.missingContextGuides, {
      colorContext: input.context.colorContext,
      modelingImageContext: input.context.modelingImageContext,
    })
  ) {
    return null;
  }

  return executeAgentPlanCycle({
    plan: pendingWorkflow.plan,
    context: {
      ...input.context,
      latestExecuteResult: pendingWorkflow.latestExecuteResult || input.context.latestExecuteResult,
    },
    clientHandlers: input.clientHandlers,
    options: input.options,
  });
};

export const cancelPendingAgentWorkflow = async (): Promise<AgentExecuteResponse | null> => {
  const workflowStore = useAgentWorkflowContinuationStore.getState();
  const runId =
    workflowStore.pendingWorkflow?.workflowRun?.runId ||
    workflowStore.persistedRunRef?.runId ||
    '';
  if (!runId) {
    workflowStore.clearPendingWorkflow();
    return null;
  }
  try {
    const result = await agentApi.cancelWorkflowRun(runId);
    workflowStore.clearPendingWorkflow();
    return result;
  } catch {
    workflowStore.clearPendingWorkflow();
    return null;
  }
};
