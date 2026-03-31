const {Buffer} = require('node:buffer');
const {handleInterpret} = require('./colorIntelligence/services/interpretService');
const {validateImageUpload} = require('./imageTo3d/imageValidation');

const AGENT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ACTION_TIMEOUT_MS = 15000;
const KNOWN_ERROR_CODES = new Set([
  'invalid_action',
  'forbidden_scope',
  'confirmation_required',
  'timeout',
  'tool_error',
  'client_required',
]);

const cloneJson = value => JSON.parse(JSON.stringify(value));

const CLIENT_REQUIRED_ADAPTERS = {
  'navigation::navigate_tab': async ({action}) => ({
    status: 'client_required',
    message: `client_action_required:${action.domain}.${action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),
  'app::summarize_current_page': async ({action}) => ({
    status: 'client_required',
    message: `client_action_required:${action.domain}.${action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),
  'grading::apply_visual_suggest': async ({action}) => ({
    status: 'client_required',
    message: `client_action_required:${action.domain}.${action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),
  'community::create_draft': async ({action}) => ({
    status: 'client_required',
    message: `client_action_required:${action.domain}.${action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),
  'community::publish_draft': async ({action}) => ({
    status: 'client_required',
    message: `client_action_required:${action.domain}.${action.operation}`,
    errorCode: 'client_required',
    retryable: true,
  }),
};

class AgentExecutionError extends Error {
  constructor({code = 'tool_error', message = 'execution_failed', retryable = false, details = undefined} = {}) {
    super(message);
    this.name = 'AgentExecutionError';
    this.code = KNOWN_ERROR_CODES.has(code) ? code : 'tool_error';
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

const normalizeScopeList = scopes =>
  (Array.isArray(scopes) ? scopes : [])
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);

const hasScope = (grantedSet, required) => {
  if (grantedSet.has('*')) {
    return true;
  }
  if (grantedSet.has(required)) {
    return true;
  }
  const namespace = required.split(':')[0];
  if (namespace && grantedSet.has(`${namespace}:*`)) {
    return true;
  }
  return false;
};

const evaluatePermission = (action, authContext) => {
  if (authContext.debugOverride) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  const requiredScopes = normalizeScopeList(action.requiredScopes);
  if (requiredScopes.length === 0) {
    return {
      allowed: true,
      missingScopes: [],
    };
  }
  const grantedSet = new Set(normalizeScopeList(authContext.grantedScopes));
  const missingScopes = requiredScopes.filter(scope => !hasScope(grantedSet, scope));
  return {
    allowed: missingScopes.length === 0,
    missingScopes,
  };
};

const isObject = value => typeof value === 'object' && value !== null;

const withTimeout = async (promise, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new AgentExecutionError({
              code: 'timeout',
              message: 'action_timeout',
              retryable: true,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const normalizeBase64Payload = raw => {
  const source = String(raw || '').trim();
  if (!source) {
    return '';
  }
  return source.replace(/^data:[^;]+;base64,/, '').trim();
};

const decodeBase64Image = raw => {
  const normalized = normalizeBase64Payload(raw);
  if (!normalized) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: 'missing_required_arg:image.base64',
    });
  }
  try {
    const buffer = Buffer.from(normalized, 'base64');
    if (!buffer.length) {
      throw new Error('empty_buffer');
    }
    return buffer;
  } catch {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: 'invalid_base64_image_payload',
    });
  }
};

const normalizeTags = input =>
  (Array.isArray(input) ? input : [])
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

const requireObject = (value, name) => {
  if (!isObject(value)) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `missing_required_arg:${name}`,
    });
  }
  return value;
};

const requireString = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `missing_required_arg:${name}`,
    });
  }
  return value.trim();
};

const requireNumber = (value, name) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `missing_required_arg:${name}`,
    });
  }
  return parsed;
};

const parseGradeArgs = args => {
  const payload = requireObject(args, 'args');
  const image = requireObject(payload.image, 'args.image');
  return {
    locale: requireString(payload.locale, 'args.locale'),
    currentParams: requireObject(payload.currentParams, 'args.currentParams'),
    image: {
      mimeType: requireString(image.mimeType, 'args.image.mimeType'),
      width: requireNumber(image.width, 'args.image.width'),
      height: requireNumber(image.height, 'args.image.height'),
      base64: requireString(image.base64, 'args.image.base64'),
    },
    imageStats: isObject(payload.imageStats) ? payload.imageStats : undefined,
  };
};

const parseConvertArgs = (args, maxUploadBytes) => {
  const payload = requireObject(args, 'args');
  const image = requireObject(payload.image, 'args.image');
  const file = {
    originalname: requireString(image.fileName, 'args.image.fileName'),
    mimetype: requireString(image.mimeType, 'args.image.mimeType'),
    buffer: decodeBase64Image(image.base64),
  };
  file.size = file.buffer.length;
  const validationError = validateImageUpload(file, maxUploadBytes);
  if (validationError) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: `${validationError.code}:${validationError.message}`,
      details: validationError.details,
    });
  }
  return file;
};

const parseSettingsPatch = args => {
  const payload = requireObject(args, 'args');
  const patch = {};
  if (typeof payload.syncOnWifi === 'boolean') {
    patch.syncOnWifi = payload.syncOnWifi;
  }
  if (typeof payload.communityNotify === 'boolean') {
    patch.communityNotify = payload.communityNotify;
  }
  if (typeof payload.voiceAutoApply === 'boolean') {
    patch.voiceAutoApply = payload.voiceAutoApply;
  }
  if (!Object.keys(patch).length) {
    throw new AgentExecutionError({
      code: 'invalid_action',
      message: 'missing_required_arg:args.settings_patch',
    });
  }
  return patch;
};

const toActionKey = action => `${action.domain}::${action.operation}`;

const resolveExecutionStatus = actionResults => {
  const hasStatus = status =>
    actionResults.some(item => String(item?.status || '').trim() === status);
  if (hasStatus('pending_confirm')) {
    return 'pending_confirm';
  }
  if (hasStatus('waiting_async_result')) {
    return 'waiting_async_result';
  }
  if (hasStatus('failed')) {
    return 'failed';
  }
  if (hasStatus('client_required')) {
    return 'client_required';
  }
  if (hasStatus('cancelled')) {
    return 'cancelled';
  }
  return 'applied';
};

const buildWorkflowState = ({actions, actionResults, status}) => {
  const totalSteps = Array.isArray(actions) ? actions.length : 0;
  if (!totalSteps) {
    return {
      currentStep: 0,
      totalSteps: 0,
      nextRequiredContext: null,
    };
  }
  const indexByActionId = new Map(
    actions.map((item, index) => [String(item.actionId || item.id || index), index]),
  );
  const firstOpenResult = actionResults.find(
    item => item.status !== 'applied' && item.status !== 'skipped',
  );
  let currentStep = totalSteps;
  if (firstOpenResult) {
    const index = indexByActionId.get(String(firstOpenResult.action?.actionId || firstOpenResult.action?.id || ''));
    if (Number.isFinite(index)) {
      currentStep = Number(index) + 1;
    }
  } else if (status === 'applied') {
    currentStep = totalSteps;
  }

  const nextRequiredContext = firstOpenResult?.action?.preconditions?.[0] || null;
  return {
    currentStep,
    totalSteps,
    nextRequiredContext,
  };
};

const mapWorkflowRunStatus = status => {
  if (status === 'pending_confirm') {
    return 'waiting_confirm';
  }
  if (status === 'waiting_async_result') {
    return 'waiting_async_result';
  }
  if (status === 'client_required') {
    return 'waiting_context';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  return 'succeeded';
};

const buildWorkflowRunSnapshot = ({runId, workflowState, status, actionResults}) => {
  const waitingItem = actionResults.find(item =>
    ['client_required', 'pending_confirm', 'waiting_async_result'].includes(String(item?.status || '')),
  );
  const waitingOutput = waitingItem?.output && typeof waitingItem.output === 'object' ? waitingItem.output : {};
  return {
    runId,
    status: mapWorkflowRunStatus(status),
    currentStep: Number(workflowState?.currentStep || 0),
    totalSteps: Number(workflowState?.totalSteps || 0),
    nextRequiredContext: workflowState?.nextRequiredContext ?? null,
    blockedReason:
      status === 'client_required'
        ? 'waiting_context'
        : status === 'pending_confirm'
          ? 'waiting_confirm'
          : status === 'waiting_async_result'
            ? 'waiting_async_result'
            : null,
    updatedAt: new Date().toISOString(),
    waitingActionId: waitingItem?.action?.actionId || null,
    pendingTask:
      status === 'waiting_async_result' && waitingOutput?.taskId
        ? {
            taskId: String(waitingOutput.taskId || ''),
            taskStatus: String(waitingOutput.status || 'processing'),
            pollAfterMs: Math.max(1500, Number(waitingOutput.pollAfterMs || 5000)),
          }
        : null,
    lastWorkerAt: new Date().toISOString(),
    nextPollAt:
      status === 'waiting_async_result' && waitingOutput?.pollAfterMs
        ? new Date(Date.now() + Math.max(1500, Number(waitingOutput.pollAfterMs || 5000))).toISOString()
        : null,
  };
};

const buildToolCalls = actionResults =>
  actionResults.map((item, index) => ({
    actionId: String(item?.action?.actionId || `action_${index + 1}`),
    serverId: item?.action?.toolRef?.serverId || 'local-agent',
    toolName: item?.action?.toolRef?.toolName || `${item?.action?.domain || 'app'}.${item?.action?.operation || 'unknown'}`,
    status: String(item?.status || 'unknown'),
    latencyMs: Number(item?.durationMs || 0),
    requestId: `req_${index + 1}_${Date.now()}`,
    retryCount: Math.max(0, Number(item?.attempts || 1) - 1),
    errorCode: item?.errorCode || undefined,
  }));

const buildResultCards = actionResults =>
  actionResults.map(item => ({
    kind:
      item?.status === 'failed'
        ? 'failure'
        : item?.status === 'client_required'
          ? 'context_required'
          : item?.status === 'pending_confirm'
            ? 'confirmation'
            : item?.status === 'waiting_async_result'
              ? 'async_wait'
              : 'tool_result',
    title: `${String(item?.action?.domain || 'agent')} · ${String(item?.action?.operation || 'action')}`,
    summary: String(item?.message || ''),
    status: String(item?.status || ''),
    artifact: item?.output && typeof item.output === 'object' ? cloneJson(item.output) : undefined,
    nextAction:
      item?.status === 'client_required'
        ? {
            type: 'provide_context',
            requiredContext: item?.action?.preconditions?.[0] || null,
          }
        : item?.status === 'pending_confirm'
          ? {
              type: 'confirm',
              actionId: item?.action?.actionId || '',
            }
          : item?.status === 'waiting_async_result'
            ? {
                type: 'wait_async',
                actionId: item?.action?.actionId || '',
                pollAfterMs: Math.max(1500, Number(item?.output?.pollAfterMs || 5000)),
              }
            : undefined,
    recovery:
      item?.status === 'failed'
        ? {
            retryable: Boolean(item?.retryable),
            errorCode: item?.errorCode || 'tool_error',
          }
        : undefined,
  }));

const calculateCompletionScore = actionResults => {
  if (!Array.isArray(actionResults) || actionResults.length === 0) {
    return 0;
  }
  const weights = {
    applied: 1,
    skipped: 1,
    pending_confirm: 0.6,
    waiting_async_result: 0.5,
    client_required: 0.4,
    failed: 0.1,
    cancelled: 0,
  };
  const total = actionResults.reduce((sum, item) => sum + (weights[item.status] ?? 0), 0);
  return Math.round((total / actionResults.length) * 100) / 100;
};

const buildRecoverySuggestions = ({status, workflowState, actionResults, runId}) => {
  const suggestions = [];
  if (status === 'client_required' && workflowState?.nextRequiredContext) {
    suggestions.push({
      type: 'provide_context',
      label: '补齐上下文后继续',
      actionRef: {
        requiredContext: workflowState.nextRequiredContext,
        runId,
      },
    });
  }
  if (status === 'pending_confirm') {
    suggestions.push({
      type: 'confirm',
      label: '确认剩余动作',
      actionRef: {runId},
    });
  }
  if (status === 'waiting_async_result') {
    suggestions.push({
      type: 'wait_async',
      label: '等待异步结果并续跑',
      actionRef: {runId},
    });
  }
  if (status === 'failed') {
    const failedAction = actionResults.find(item => item.status === 'failed');
    suggestions.push({
      type: 'retry',
      label: '重试失败步骤',
      actionRef: {
        runId,
        actionId: failedAction?.action?.actionId || '',
      },
    });
  }
  return suggestions;
};

const buildResultSummary = ({status, actionResults, workflowState}) => {
  const failedCount = actionResults.filter(item => item.status === 'failed').length;
  const appliedCount = actionResults.filter(item => item.status === 'applied').length;
  const clientRequiredCount = actionResults.filter(item => item.status === 'client_required').length;
  if (status === 'applied') {
    return {
      done: `已完成 ${appliedCount} 项动作。`,
      why: '工作流已顺利执行完成。',
      next: '可继续发起新的 Agent 指令。',
    };
  }
  if (status === 'client_required') {
    return {
      done: `已执行 ${appliedCount} 项动作。`,
      why: `仍有 ${clientRequiredCount} 项动作依赖客户端上下文或权限。`,
      next: workflowState?.nextRequiredContext
        ? `补齐 ${workflowState.nextRequiredContext} 后可继续续跑。`
        : '补齐上下文后可继续续跑。',
    };
  }
  if (status === 'pending_confirm') {
    return {
      done: `已自动完成 ${appliedCount} 项低风险动作。`,
      why: '剩余动作需要用户确认。',
      next: '确认后即可继续执行剩余步骤。',
    };
  }
  if (status === 'waiting_async_result') {
    return {
      done: `已启动 ${appliedCount} 项前置动作。`,
      why: '当前存在后台异步任务正在处理中。',
      next: '等待后台结果返回后即可自动续跑。',
    };
  }
  if (status === 'failed') {
    return {
      done: `已完成 ${appliedCount} 项动作。`,
      why: `当前有 ${failedCount} 项动作失败。`,
      next: '可查看失败卡片后重试或补齐依赖继续。',
    };
  }
  return {
    done: '工作流已结束。',
    why: '当前链路已停止。',
    next: '可重新生成计划或继续处理未完成步骤。',
  };
};

const buildNextAction = ({status, workflowRun, workflowState, actionResults}) => {
  if (status === 'pending_confirm') {
    const pending = actionResults.find(item => item.status === 'pending_confirm');
    return {
      type: 'confirm',
      label: '确认并继续执行',
      actionId: pending?.action?.actionId || '',
      runId: workflowRun?.runId || '',
    };
  }
  if (status === 'client_required') {
    return {
      type: 'provide_context',
      label: '补齐上下文后继续',
      targetTab:
        workflowState?.nextRequiredContext === 'context.modeling.image'
          ? 'model'
          : workflowState?.nextRequiredContext === 'context.community.draftId'
            ? 'community'
            : 'create',
      requiredContext: workflowState?.nextRequiredContext || undefined,
      runId: workflowRun?.runId || '',
    };
  }
  if (status === 'waiting_async_result') {
    return {
      type: 'wait_async',
      label: '等待异步结果',
      pollAfterMs: workflowRun?.pendingTask?.pollAfterMs || 5000,
      nextPollAt: workflowRun?.nextPollAt || undefined,
      runId: workflowRun?.runId || '',
    };
  }
  if (status === 'failed') {
    const failed = actionResults.find(item => item.status === 'failed');
    return {
      type: 'retry',
      label: '重试失败步骤',
      actionId: failed?.action?.actionId || '',
      runId: workflowRun?.runId || '',
    };
  }
  if (status === 'applied') {
    return {
      type: 'resume',
      label: '查看执行详情',
      runId: workflowRun?.runId || '',
    };
  }
  return undefined;
};

const buildExecutePayload = ({
  runId,
  executionId,
  planId,
  namespace,
  actions,
  actionResults,
  toolCalls,
  auditId,
  traceId,
  pageSummary,
  clientHandledActions,
  appliedStrategy,
  outcomeRecorded,
}) => {
  const appliedActions = actionResults
    .filter(item => item.status === 'applied')
    .map(item => item.action);
  const pendingActions = actionResults
    .filter(item => item.status === 'pending_confirm')
    .map(item => item.action);
  const failedActions = actionResults
    .filter(item => item.status === 'failed')
    .map(item => ({
      action: item.action,
      reason: item.message || 'execution_failed',
      errorCode: item.errorCode || 'tool_error',
      retryable: Boolean(item.retryable),
    }));
  const clientRequiredActions = actionResults
    .filter(item => item.status === 'client_required')
    .map(item => item.action);
  const status = resolveExecutionStatus(actionResults);
  const workflowState = buildWorkflowState({
    actions,
    actionResults,
    status,
  });
  const workflowRun = buildWorkflowRunSnapshot({
    runId,
    workflowState,
    status,
    actionResults,
  });
  const normalizedToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0 ? toolCalls : buildToolCalls(actionResults);
  const resultCards = buildResultCards(actionResults);
  const completionScore = calculateCompletionScore(actionResults);
  const resultSummary = buildResultSummary({status, actionResults, workflowState});
  const nextAction = buildNextAction({status, workflowRun, workflowState, actionResults});
  const recoverySuggestions = buildRecoverySuggestions({status, workflowState, actionResults, runId});

  return {
    executionId,
    planId,
    namespace,
    auditId,
    traceId,
    actionResults,
    appliedActions,
    failedActions,
    pendingActions,
    clientRequiredActions,
    rollbackAvailable: appliedActions.length > 0,
    workflowState,
    workflowRun,
    toolCalls: normalizedToolCalls,
    resultCards,
    completionScore,
    recoverySuggestions,
    resultSummary,
    nextAction,
    appliedStrategy: appliedStrategy || undefined,
    outcomeRecorded: Boolean(outcomeRecorded),
    clientHandledActions: Array.isArray(clientHandledActions) ? clientHandledActions : [],
    pageSummary: pageSummary || undefined,
    status,
  };
};

const buildDefaultActionAdapters = ({
  resolveServices,
  colorInterpreter = handleInterpret,
}) => ({
  'community::create_draft': async ({action, userId, sharedContext}) => {
    const {communityRepo} = resolveServices();
    if (!communityRepo || typeof communityRepo.createDraft !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'community_repository_unavailable',
      });
    }

    const args = isObject(action.args) ? action.args : {};
    const payload = {
      title:
        typeof args.title === 'string' && args.title.trim()
          ? args.title.trim().slice(0, 120)
          : 'AI 生成草稿',
      content: typeof args.content === 'string' ? args.content.trim().slice(0, 4000) : '',
      beforeUrl: typeof args.beforeUrl === 'string' ? args.beforeUrl.trim().slice(0, 1200) : '',
      afterUrl: typeof args.afterUrl === 'string' ? args.afterUrl.trim().slice(0, 1200) : '',
      tags: normalizeTags(args.tags),
      gradingParams: isObject(args.gradingParams) ? args.gradingParams : {},
    };

    const created = await communityRepo.createDraft(userId, payload);
    if (!created?.id) {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'failed_to_create_draft',
      });
    }
    sharedContext.lastDraftId = String(created.id);
    return {
      status: 'applied',
      message: 'draft_created',
      output: {
        draftId: String(created.id),
      },
    };
  },

  'community::publish_draft': async ({action, userId, sharedContext}) => {
    const {communityRepo} = resolveServices();
    if (!communityRepo || typeof communityRepo.publishDraft !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'community_repository_unavailable',
      });
    }

    const args = isObject(action.args) ? action.args : {};
    const candidateDraftIdRaw =
      args.draftId !== undefined && args.draftId !== null
        ? String(args.draftId).trim()
        : sharedContext.lastDraftId || '';
    if (!candidateDraftIdRaw) {
      throw new AgentExecutionError({
        code: 'invalid_action',
        message: 'missing_required_arg:args.draftId',
      });
    }
    const published = await communityRepo.publishDraft(userId, candidateDraftIdRaw);
    if (!published?.id) {
      throw new AgentExecutionError({
        code: 'invalid_action',
        message: 'draft_not_found_or_not_owned',
      });
    }
    sharedContext.lastPublishedPostId = String(published.id);
    return {
      status: 'applied',
      message: 'draft_published',
      output: {
        postId: String(published.id),
        draftId: candidateDraftIdRaw,
      },
    };
  },

  'settings::apply_patch': async ({action, userId}) => {
    const {settingsRepo} = resolveServices();
    if (!settingsRepo || typeof settingsRepo.updateMySettings !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'settings_repository_unavailable',
      });
    }
    const patch = parseSettingsPatch(action.args);
    const updated = await settingsRepo.updateMySettings(userId, patch);
    return {
      status: 'applied',
      message: 'settings_updated',
      output: {
        settings: updated || null,
      },
    };
  },

  'grading::apply_visual_suggest': async ({action, sharedContext}) => {
    const args = parseGradeArgs(action.args);
    const result = await colorInterpreter(
      {
        ...args,
        mode: 'initial_visual_suggest',
        transcript: '',
      },
      {
        strictMode: true,
        responseShape: 'module',
        forceMode: 'initial_visual_suggest',
      },
    );
    if (!result || result.status !== 200) {
      const errorPayload = result?.payload?.error || {};
      throw new AgentExecutionError({
        code: 'tool_error',
        message: String(errorPayload.message || errorPayload.code || 'initial_suggest_failed'),
      });
    }
    sharedContext.lastGradingResult = result.payload;
    return {
      status: 'applied',
      message: 'initial_visual_suggest_applied',
      output: {
        confidence: Number(result.payload?.confidence || 0),
        actionsCount: Array.isArray(result.payload?.actions) ? result.payload.actions.length : 0,
      },
    };
  },

  'convert::start_task': async ({action}) => {
    const {modelingService, modelingConfig} = resolveServices();
    if (!modelingService || typeof modelingService.createTask !== 'function') {
      throw new AgentExecutionError({
        code: 'tool_error',
        message: 'modeling_service_unavailable',
      });
    }
    const maxUploadBytes = Number(modelingConfig?.maxUploadBytes || 10 * 1024 * 1024);
    const file = parseConvertArgs(action.args, maxUploadBytes);
    const task = await modelingService.createTask(file, {
      sourceImageRef: 'agent:convert.start_task',
    });
    return {
      status: 'applied',
      message: 'modeling_task_created',
      output: {
        taskId: String(task.taskId || ''),
        status: String(task.status || ''),
        pollAfterMs: Number(modelingConfig?.pollAfterMs || 5000),
      },
    };
  },
});

const normalizeActionErrorCode = code =>
  KNOWN_ERROR_CODES.has(code) ? code : 'tool_error';

const createAgentExecutionService = ({
  resolveServices = () => ({}),
  colorInterpreter = handleInterpret,
  actionAdapters = null,
} = {}) => {
  const idempotencyMap = new Map();
  const baseAdapters = actionAdapters || buildDefaultActionAdapters({resolveServices, colorInterpreter});

  const cleanupIdempotency = () => {
    const now = Date.now();
    for (const [key, value] of idempotencyMap.entries()) {
      if (now - value.createdAt > AGENT_IDEMPOTENCY_TTL_MS) {
        idempotencyMap.delete(key);
      }
    }
  };

  const execute = async ({
    userId = '',
    namespace = 'app.agent',
    planId,
    actions,
    actionIds = [],
    idempotencyKey = '',
    allowConfirmActions = false,
    grantedScopes = [],
    debugOverride = false,
    executionStrategy = undefined,
  }) => {
    cleanupIdempotency();
    const dedupeKey = idempotencyKey ? `${userId || 'anonymous'}::${namespace}::${planId}::${idempotencyKey}` : '';
    if (dedupeKey && idempotencyMap.has(dedupeKey)) {
      return idempotencyMap.get(dedupeKey).payload;
    }

    const filtered = actionIds.length
      ? actions.filter(action => actionIds.includes(action.actionId))
      : actions;
    const sharedContext = {};
    const actionResults = [];

    for (const action of filtered) {
      const permission = evaluatePermission(action, {
        grantedScopes,
        debugOverride,
      });
      if (!permission.allowed) {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'failed',
          message: `forbidden_scope:${permission.missingScopes.join(',')}`,
          errorCode: 'forbidden_scope',
          retryable: false,
          skillName: action.skillName || 'agent-permission-gate',
        });
        continue;
      }

      if ((action.requiresConfirmation || action.riskLevel !== 'low') && !allowConfirmActions) {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'pending_confirm',
          message: 'confirmation_required',
          errorCode: 'confirmation_required',
          retryable: true,
          skillName: action.skillName || 'agent-permission-gate',
        });
        continue;
      }

      const actionKey = toActionKey(action);
      const clientRequiredAdapter = CLIENT_REQUIRED_ADAPTERS[actionKey];
      if (typeof clientRequiredAdapter === 'function') {
        const startedAt = Date.now();
        const result = await clientRequiredAdapter({action});
        actionResults.push({
          action,
          attempts: 1,
          durationMs: Date.now() - startedAt,
          status: result.status || 'client_required',
          message: result.message || 'client_action_required',
          errorCode: 'client_required',
          retryable: true,
          skillName: action.skillName || 'agent-tool-router',
        });
        continue;
      }

      const adapter = baseAdapters[actionKey];
      if (typeof adapter !== 'function') {
        actionResults.push({
          action,
          attempts: 1,
          durationMs: 0,
          status: 'failed',
          message: `unsupported_action:${action.domain}.${action.operation}`,
          errorCode: 'invalid_action',
          retryable: false,
          skillName: action.skillName || 'agent-tool-router',
        });
        continue;
      }

      const startedAt = Date.now();
      try {
        const timeoutMs =
          Number.isFinite(Number(action.timeoutMs)) && Number(action.timeoutMs) > 0
            ? Number(action.timeoutMs)
            : DEFAULT_ACTION_TIMEOUT_MS;
        const adapterResult = await withTimeout(
          Promise.resolve(
            adapter({
              action,
              userId,
              sharedContext,
            }),
          ),
          timeoutMs,
        );
        actionResults.push({
          action,
          attempts: 1,
          durationMs: Date.now() - startedAt,
          status: adapterResult?.status || 'applied',
          message: adapterResult?.message || 'applied',
          errorCode: adapterResult?.errorCode,
          retryable: Boolean(adapterResult?.retryable),
          output: adapterResult?.output,
          skillName: action.skillName || 'agent-tool-router',
        });
      } catch (error) {
        const failure =
          error instanceof AgentExecutionError
            ? error
            : new AgentExecutionError({
                code: 'tool_error',
                message: error?.message || 'tool_execution_failed',
              });
        actionResults.push({
          action,
          attempts: 1,
          durationMs: Date.now() - startedAt,
          status: failure.code === 'client_required' ? 'client_required' : 'failed',
          message: failure.message || 'tool_execution_failed',
          errorCode: normalizeActionErrorCode(failure.code),
          retryable: Boolean(failure.retryable),
          details: failure.details,
          skillName: action.skillName || 'agent-tool-router',
        });
      }
    }

    const payload = buildExecutePayload({
      runId: `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      executionId: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      planId,
      namespace,
      actions: filtered,
      actionResults,
      appliedStrategy: executionStrategy,
      outcomeRecorded: true,
    });
    if (dedupeKey) {
      idempotencyMap.set(dedupeKey, {
        payload,
        createdAt: Date.now(),
      });
    }
    return payload;
  };

  return {
    execute,
  };
};

module.exports = {
  createAgentExecutionService,
  AgentExecutionError,
  buildWorkflowState,
  buildWorkflowRunSnapshot,
  buildExecutePayload,
  resolveExecutionStatus,
};
