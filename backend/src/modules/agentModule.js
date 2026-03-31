const express = require('express');
const path = require('path');
const {
  validateAgentPlanRequest,
  normalizeAgentPlanResponse,
  validateExecuteRequest,
  validateMemoryUpsertRequest,
  validateMemoryQueryRequest,
} = require('../agentContracts');
const {planAgentActions} = require('../agentPlanner');
const {createAgentExecutionService, buildExecutePayload} = require('../agentExecution');
const {createAgentMemoryStore} = require('../agentMemoryStore');
const {createAgentRunStore} = require('../agentRunStore');
const {createAgentAsyncRecoveryRegistry} = require('../agentAsyncRecovery');
const {getAuthBypassUser, isAuthBypassEnabled} = require('../authBypass');
const {sendError} = require('./errorResponse');

const MODULE_NAME = 'agent';
const BASE_PATH = '/v1/modules/agent';

const requiredEnv = ['AGENT_MEMORY_PATH', 'AGENT_RUNS_PATH'];

const DEFAULT_STRATEGY_METRICS = {
  fast: {
    planLatencyP50Ms: 280,
    planLatencyP95Ms: 540,
    executeSuccessRate: 0.78,
    interruptionRate: 0.18,
    sampleCount: 18,
  },
  quality: {
    planLatencyP50Ms: 420,
    planLatencyP95Ms: 860,
    executeSuccessRate: 0.84,
    interruptionRate: 0.11,
    sampleCount: 12,
  },
  cost: {
    planLatencyP50Ms: 210,
    planLatencyP95Ms: 430,
    executeSuccessRate: 0.72,
    interruptionRate: 0.21,
    sampleCount: 10,
  },
  adaptive: {
    planLatencyP50Ms: 330,
    planLatencyP95Ms: 640,
    executeSuccessRate: 0.81,
    interruptionRate: 0.14,
    sampleCount: 24,
  },
};

const parseScopesHeader = value => {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

const resolveAgentGrantedScopes = req => {
  const fromUser = Array.isArray(req.user?.scopes)
    ? req.user.scopes.filter(item => typeof item === 'string' && item.trim())
    : [];
  const fromHeader = parseScopesHeader(req.header('x-agent-scopes'));
  const merged = new Set([...fromUser, ...fromHeader]);
  return Array.from(merged);
};

const clone = value => JSON.parse(JSON.stringify(value));

const normalizeActionIdsForResume = latestExecuteResult => {
  const actionResults = Array.isArray(latestExecuteResult?.actionResults)
    ? latestExecuteResult.actionResults
    : [];
  return actionResults
    .filter(item => !['applied', 'skipped', 'cancelled'].includes(String(item?.status || '').trim()))
    .map(item => String(item?.action?.actionId || '').trim())
    .filter(Boolean);
};

const hydrateActionsWithContextPatch = (actions, contextPatch = {}) =>
  (Array.isArray(actions) ? actions : []).map(action => {
    if (
      action?.domain === 'grading' &&
      action?.operation === 'apply_visual_suggest' &&
      contextPatch?.colorContext?.image?.base64
    ) {
      return {
        ...action,
        args: {
          locale: contextPatch.colorContext.locale,
          currentParams: contextPatch.colorContext.currentParams,
          image: contextPatch.colorContext.image,
          imageStats: contextPatch.colorContext.imageStats,
        },
      };
    }
    if (
      action?.domain === 'convert' &&
      action?.operation === 'start_task' &&
      contextPatch?.modelingImageContext?.image?.base64
    ) {
      return {
        ...action,
        args: {
          image: contextPatch.modelingImageContext.image,
        },
      };
    }
    return action;
  });

const createAgentModule = ({
  getAuthMiddleware,
  getCommunityRepo,
  getSettingsRepo,
  getModelingService,
  getModelingConfig,
} = {}) => {
  const router = express.Router();
  const agentExecutionService = createAgentExecutionService({
    resolveServices: () => ({
      communityRepo: (typeof getCommunityRepo === 'function' ? getCommunityRepo() : null) || null,
      settingsRepo: (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null,
      modelingService:
        (typeof getModelingService === 'function' ? getModelingService() : null) || null,
      modelingConfig:
        (typeof getModelingConfig === 'function' ? getModelingConfig() : null) || null,
    }),
  });
  const agentMemoryStore = createAgentMemoryStore({
    filePath: process.env.AGENT_MEMORY_PATH || path.resolve(__dirname, '../../data/agent-memory.json'),
  });
  const agentRunStore = createAgentRunStore({
    filePath: process.env.AGENT_RUNS_PATH || path.resolve(__dirname, '../../data/agent-runs.json'),
  });
  const asyncRecoveryRegistry = createAgentAsyncRecoveryRegistry({
    getModelingService,
    getModelingConfig,
    rebuildExecutePayload: buildExecutePayload,
  });
  const metrics = {
    planTotal: 0,
    planFallbackLocal: 0,
    executeTotal: 0,
    workflowCompleted: 0,
    actionApplied: 0,
    actionFailed: 0,
    actionPending: 0,
    actionClientRequired: 0,
    rollbackAvailable: 0,
    scopeCheckTotal: 0,
    scopeCheckPassed: 0,
    blockedByPolicyCount: 0,
    runRegisteredTotal: 0,
    runResumedTotal: 0,
    runCancelledTotal: 0,
    runRetriedTotal: 0,
    asyncRecoveredTotal: 0,
  };

  const persistRunRecord = ({runId, planId, namespace, actions, latestExecuteResult, userId, event}) =>
    agentRunStore.upsert(
      {
        runId,
        planId,
        namespace,
        actions: clone(actions || []),
        latestExecuteResult: clone(latestExecuteResult || null),
        userId: String(userId || ''),
      },
      {event},
    );

  const ensureRunAccess = (record, userId, res) => {
    if (!record) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return false;
    }
    if (String(record.userId || '') !== String(userId || '')) {
      sendError(res, 403, 'FORBIDDEN', 'agent_workflow_run_forbidden');
      return false;
    }
    return true;
  };

  const maybeRefreshAsyncRun = async record => {
    const refreshed = await asyncRecoveryRegistry.refreshRecord(record);
    if (!refreshed?.changed || !refreshed.result) {
      return record;
    }
    metrics.asyncRecoveredTotal += 1;
    return persistRunRecord({
      runId: record.runId,
      planId: record.planId,
      namespace: record.namespace,
      actions: record.actions,
      latestExecuteResult: refreshed.result,
      userId: record.userId,
      event: refreshed.recoveryEvent,
    });
  };

  const ensureBypassUser = async bypassUser => {
    const settingsRepo = (typeof getSettingsRepo === 'function' ? getSettingsRepo() : null) || null;
    if (!settingsRepo || typeof settingsRepo.ensureAuthUser !== 'function') {
      return;
    }
    await settingsRepo.ensureAuthUser({
      id: bypassUser.id,
      username: bypassUser.username,
      isBypass: true,
    });
  };

  const requireAgentAuth = async (req, res, next) => {
    const authMiddleware = typeof getAuthMiddleware === 'function' ? getAuthMiddleware() : null;
    if (authMiddleware) {
      return authMiddleware(req, res, next);
    }
    if (!isAuthBypassEnabled()) {
      sendError(res, 503, 'AUTH_MODULE_UNAVAILABLE', 'auth_module_unavailable');
      return undefined;
    }
    const bypassUser = getAuthBypassUser();
    try {
      await ensureBypassUser(bypassUser);
    } catch (error) {
      sendError(
        res,
        500,
        'AUTH_BYPASS_USER_INIT_FAILED',
        error?.message || 'auth_bypass_user_init_failed',
      );
      return undefined;
    }
    req.user = {
      ...bypassUser,
      id: String(bypassUser.id),
      scopes: ['*'],
    };
    next();
    return undefined;
  };

  router.post('/plan', async (req, res) => {
    const validation = validateAgentPlanRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const rawPlan = planAgentActions(req.body);
    const normalized = normalizeAgentPlanResponse(rawPlan);
    if (!normalized) {
      sendError(res, 500, 'PLAN_NORMALIZATION_FAILED', 'agent plan normalization failed');
      return;
    }
    metrics.planTotal += 1;
    if (normalized.plannerSource === 'local') {
      metrics.planFallbackLocal += 1;
    }
    const inputSource = req.body?.inputSource === 'voice' ? 'voice' : 'text';
    const stageSet = new Set(
      (Array.isArray(normalized.actions) ? normalized.actions : [])
        .map(item => String(item.stage || '').trim())
        .filter(Boolean),
    );
    console.log(
      '[agent-plan]',
      JSON.stringify({
        planId: normalized.planId,
        inputSource,
        plannerSource: normalized.plannerSource,
        actionCount: normalized.actions.length,
        stages: Array.from(stageSet),
      }),
    );
    res.json(normalized);
  });

  router.post('/execute', requireAgentAuth, async (req, res) => {
    const validation = validateExecuteRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const payload = validation.payload;
    const userId = String(req.user?.id || payload.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const result = await agentExecutionService.execute({
      ...payload,
      userId,
      namespace: payload.namespace || 'app.agent',
      grantedScopes,
      debugOverride,
    });
    const runId = String(result.workflowRun?.runId || `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);
    result.workflowRun = result.workflowRun
      ? {
          ...result.workflowRun,
          runId,
        }
      : result.workflowState
        ? {
            runId,
            status:
              result.status === 'pending_confirm'
                ? 'waiting_confirm'
                : result.status === 'client_required'
                  ? 'waiting_context'
                  : result.status === 'waiting_async_result'
                    ? 'waiting_async_result'
                    : result.status === 'failed'
                      ? 'failed'
                      : 'succeeded',
            currentStep: result.workflowState.currentStep,
            totalSteps: result.workflowState.totalSteps,
            nextRequiredContext: result.workflowState.nextRequiredContext,
            blockedReason:
              result.status === 'client_required'
                ? 'waiting_context'
                : result.status === 'pending_confirm'
                  ? 'waiting_confirm'
                  : result.status === 'waiting_async_result'
                    ? 'waiting_async_result'
                    : null,
            updatedAt: new Date().toISOString(),
          }
        : null;
    metrics.executeTotal += 1;
    if (result.status === 'applied') {
      metrics.workflowCompleted += 1;
    }
    metrics.actionApplied += result.appliedActions.length;
    metrics.actionFailed += result.failedActions.length;
    metrics.actionPending += result.pendingActions.length;
    metrics.actionClientRequired += Array.isArray(result.clientRequiredActions)
      ? result.clientRequiredActions.length
      : 0;
    if (result.rollbackAvailable) {
      metrics.rollbackAvailable += 1;
    }
    const scopedResults = result.actionResults.filter(
      item => Array.isArray(item.action?.requiredScopes) && item.action.requiredScopes.length > 0,
    );
    const scopePassed = scopedResults.filter(item => item.errorCode !== 'forbidden_scope').length;
    metrics.scopeCheckTotal += scopedResults.length;
    metrics.scopeCheckPassed += scopePassed;
    const blockedByPolicyCount = result.actionResults.filter(
      item => item.errorCode === 'forbidden_scope' || item.errorCode === 'confirmation_required',
    ).length;
    metrics.blockedByPolicyCount += blockedByPolicyCount;
    const firstFailure = result.actionResults.find(item => item.status === 'failed');
    console.log(
      '[agent-execute]',
      JSON.stringify({
        planId: result.planId,
        executionId: result.executionId,
        status: result.status,
        actionCount: result.actionResults.length,
        appliedCount: result.appliedActions.length,
        pendingCount: result.pendingActions.length,
        failedCount: result.failedActions.length,
        nextRequiredContext: result.workflowState?.nextRequiredContext || '',
        firstFailure: firstFailure
          ? {
              domain: firstFailure.action?.domain || '',
              operation: firstFailure.action?.operation || '',
              errorCode: firstFailure.errorCode || '',
              message: firstFailure.message || '',
            }
          : null,
      }),
    );
    persistRunRecord({
      runId,
      planId: result.planId,
      namespace: result.namespace,
      actions: payload.actions,
      latestExecuteResult: result,
      userId,
      event: {
        type: 'executed',
        status: result.workflowRun?.status || result.status,
        message: '执行结果已记录',
      },
    });
    res.json(result);
  });

  router.post('/runs/register', requireAgentAuth, async (req, res) => {
    const latestExecuteResult =
      req.body?.latestExecuteResult && typeof req.body.latestExecuteResult === 'object'
        ? req.body.latestExecuteResult
        : null;
    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    const planId = String(req.body?.planId || latestExecuteResult?.planId || '').trim();
    const userId = String(req.user?.id || '').trim();
    if (!planId || !latestExecuteResult) {
      sendError(res, 400, 'BAD_REQUEST', 'planId and latestExecuteResult are required');
      return;
    }
    const runId = String(
      req.body?.runId ||
        latestExecuteResult?.workflowRun?.runId ||
        `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    ).trim();
    const normalizedExecuteResult =
      latestExecuteResult?.workflowRun?.runId || Array.isArray(latestExecuteResult?.actionResults)
        ? {
            ...clone(latestExecuteResult),
            workflowRun: latestExecuteResult.workflowRun
              ? {...latestExecuteResult.workflowRun, runId}
              : latestExecuteResult.workflowState
                ? {
                    runId,
                    status:
                      latestExecuteResult.status === 'pending_confirm'
                        ? 'waiting_confirm'
                        : latestExecuteResult.status === 'client_required'
                          ? 'waiting_context'
                          : latestExecuteResult.status === 'waiting_async_result'
                            ? 'waiting_async_result'
                            : latestExecuteResult.status === 'failed'
                              ? 'failed'
                              : 'succeeded',
                    currentStep: latestExecuteResult.workflowState.currentStep,
                    totalSteps: latestExecuteResult.workflowState.totalSteps,
                    nextRequiredContext: latestExecuteResult.workflowState.nextRequiredContext,
                    blockedReason: null,
                    updatedAt: new Date().toISOString(),
                  }
                : null,
          }
        : buildExecutePayload({
            runId,
            executionId: String(latestExecuteResult.executionId || `register_${Date.now()}`),
            planId,
            namespace: String(req.body?.namespace || latestExecuteResult?.namespace || 'app.agent'),
            actions,
            actionResults: Array.isArray(latestExecuteResult?.actionResults)
              ? latestExecuteResult.actionResults
              : [],
            toolCalls: latestExecuteResult?.toolCalls || [],
            auditId: latestExecuteResult?.auditId,
            traceId: latestExecuteResult?.traceId,
            pageSummary: latestExecuteResult?.pageSummary,
            clientHandledActions: latestExecuteResult?.clientHandledActions,
            appliedStrategy: latestExecuteResult?.appliedStrategy,
            outcomeRecorded: latestExecuteResult?.outcomeRecorded,
          });
    metrics.runRegisteredTotal += 1;
    const stored = persistRunRecord({
      runId,
      planId,
      namespace: String(req.body?.namespace || latestExecuteResult?.namespace || 'app.agent'),
      actions,
      latestExecuteResult: normalizedExecuteResult,
      userId,
      event: {
        type: 'registered',
        status: normalizedExecuteResult?.workflowRun?.status || normalizedExecuteResult?.status || '',
        message: '工作流已注册到运行存储',
      },
    });
    res.json(stored.latestExecuteResult);
  });

  router.get('/runs/:runId', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    const record = await maybeRefreshAsyncRun(agentRunStore.get(req.params.runId));
    if (!ensureRunAccess(record, userId, res)) {
      return;
    }
    res.json(record.latestExecuteResult);
  });

  router.get('/runs/:runId/history', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    const record = await maybeRefreshAsyncRun(agentRunStore.get(req.params.runId));
    if (!ensureRunAccess(record, userId, res)) {
      return;
    }
    res.json({
      ok: true,
      runId: record.runId,
      planId: record.planId,
      history: agentRunStore.getHistory(record.runId),
      latestExecuteResult: record.latestExecuteResult || null,
    });
  });

  router.post('/runs/:runId/resume', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    let record = await maybeRefreshAsyncRun(agentRunStore.get(req.params.runId));
    if (!ensureRunAccess(record, userId, res)) {
      return;
    }
    const latestExecuteResult = record.latestExecuteResult || null;
    if (!latestExecuteResult) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }
    const actionIds = normalizeActionIdsForResume(latestExecuteResult);
    if (actionIds.length === 0) {
      res.json(latestExecuteResult);
      return;
    }
    const hydratedActions = hydrateActionsWithContextPatch(record.actions, req.body?.contextPatch);
    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const resumed = await agentExecutionService.execute({
      userId,
      namespace: record.namespace || 'app.agent',
      planId: record.planId,
      actions: hydratedActions,
      actionIds,
      allowConfirmActions: req.body?.allowConfirmActions === true,
      grantedScopes,
      debugOverride,
    });
    metrics.runResumedTotal += 1;
    record = persistRunRecord({
      runId: record.runId,
      planId: record.planId,
      namespace: record.namespace,
      actions: hydratedActions,
      latestExecuteResult: {
        ...resumed,
        workflowRun: resumed.workflowRun
          ? {...resumed.workflowRun, runId: record.runId}
          : resumed.workflowRun,
      },
      userId,
      event: {
        type: 'resumed',
        status: resumed.workflowRun?.status || resumed.status,
        message: '工作流已恢复执行',
      },
    });
    res.json(record.latestExecuteResult);
  });

  router.post('/runs/:runId/callback', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    const beforeRecord = agentRunStore.get(req.params.runId);
    const record = await maybeRefreshAsyncRun(beforeRecord);
    if (!ensureRunAccess(record, userId, res)) {
      return;
    }
    res.json({
      ok: true,
      runId: record.runId,
      changed: String(beforeRecord?.updatedAt || '') !== String(record?.updatedAt || ''),
      status: String(record?.latestExecuteResult?.workflowRun?.status || record?.latestExecuteResult?.status || ''),
    });
  });

  router.post('/runs/:runId/cancel', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    const record = agentRunStore.get(req.params.runId);
    if (!ensureRunAccess(record, userId, res)) {
      return;
    }
    const latest = clone(record.latestExecuteResult || {});
    latest.status = 'cancelled';
    latest.workflowRun = latest.workflowRun
      ? {
          ...latest.workflowRun,
          runId: record.runId,
          status: 'cancelled',
          blockedReason: 'cancelled',
          updatedAt: new Date().toISOString(),
        }
      : null;
    latest.actionResults = Array.isArray(latest.actionResults)
      ? latest.actionResults.map(item =>
          ['client_required', 'pending_confirm', 'waiting_async_result'].includes(String(item?.status || ''))
            ? {
                ...item,
                status: 'cancelled',
                message: 'workflow_cancelled',
              }
            : item,
        )
      : [];
    metrics.runCancelledTotal += 1;
    const stored = persistRunRecord({
      runId: record.runId,
      planId: record.planId,
      namespace: record.namespace,
      actions: record.actions,
      latestExecuteResult: latest,
      userId,
      event: {
        type: 'cancelled',
        status: 'cancelled',
        message: '工作流已取消',
      },
    });
    res.json(stored.latestExecuteResult);
  });

  router.post('/runs/:runId/retry', requireAgentAuth, async (req, res) => {
    const userId = String(req.user?.id || '').trim();
    const record = agentRunStore.get(req.params.runId);
    if (!ensureRunAccess(record, userId, res)) {
      return;
    }
    const latest = record.latestExecuteResult || null;
    if (!latest) {
      sendError(res, 404, 'RUN_NOT_FOUND', 'agent_workflow_run_not_found');
      return;
    }
    const actionIds = Array.isArray(req.body?.actionIds) && req.body.actionIds.length > 0
      ? req.body.actionIds
      : normalizeActionIdsForResume(latest);
    const grantedScopes = resolveAgentGrantedScopes(req);
    const debugOverride = Boolean(req.user?.isBypass) || isAuthBypassEnabled();
    const retried = await agentExecutionService.execute({
      userId,
      namespace: record.namespace || 'app.agent',
      planId: record.planId,
      actions: record.actions,
      actionIds,
      allowConfirmActions: req.body?.allowConfirmActions === true,
      grantedScopes,
      debugOverride,
    });
    metrics.runRetriedTotal += 1;
    const stored = persistRunRecord({
      runId: record.runId,
      planId: record.planId,
      namespace: record.namespace,
      actions: record.actions,
      latestExecuteResult: {
        ...retried,
        workflowRun: retried.workflowRun
          ? {...retried.workflowRun, runId: record.runId}
          : retried.workflowRun,
      },
      userId,
      event: {
        type: 'retried',
        status: retried.workflowRun?.status || retried.status,
        message: '工作流已重试',
      },
    });
    res.json(stored.latestExecuteResult);
  });

  router.post('/memory/upsert', requireAgentAuth, async (req, res) => {
    const validation = validateMemoryUpsertRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }

    const userId = String(req.user?.id || req.body.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const stored = agentMemoryStore.upsert({
      userId,
      namespace: String(req.body.namespace || '').trim(),
      key: String(req.body.key || '').trim(),
      value: req.body.value,
      ttlSeconds: req.body.ttlSeconds,
    });
    res.json({
      ok: true,
      key: req.body.key,
      version: stored.version,
      updatedAt: stored.updatedAt,
    });
  });

  router.post('/memory/query', requireAgentAuth, async (req, res) => {
    const validation = validateMemoryQueryRequest(req.body);
    if (!validation.ok) {
      sendError(res, 400, 'BAD_REQUEST', validation.message);
      return;
    }
    const userId = String(req.user?.id || req.body.userId || '').trim();
    if (!userId) {
      sendError(res, 401, 'UNAUTHORIZED', 'unauthorized');
      return;
    }
    const result = agentMemoryStore.query({
      userId,
      namespace: String(req.body.namespace || '').trim(),
      key: String(req.body.key || '').trim(),
    });

    res.json({
      ok: true,
      key: result.key,
      value: result.value,
      version: result.version,
      updatedAt: result.updatedAt,
    });
  });

  router.get('/health', (_req, res) => {
    res.json({
      module: MODULE_NAME,
      ok: true,
      strictMode: true,
      plannerSource: 'hybrid',
      strategySource: 'adaptive',
      degraded: false,
      fallbackSource: 'local-run-store',
      metrics: {
        ...metrics,
        strategyMetrics: DEFAULT_STRATEGY_METRICS,
        asyncRecoveryEnabled: true,
        runStoreEnabled: true,
        skillPackRegistry: ['vision.create', 'vision.model', 'vision.community'],
        mcpGatewayMode: 'degraded-local',
      },
    });
  });

  return {
    module: MODULE_NAME,
    basePath: BASE_PATH,
    router,
    async init() {},
    async healthCheck() {
      return {
        module: MODULE_NAME,
        ok: true,
        strictMode: true,
        plannerSource: 'hybrid',
        strategySource: 'adaptive',
        degraded: false,
        fallbackSource: 'local-run-store',
        metrics: {
          ...metrics,
          strategyMetrics: DEFAULT_STRATEGY_METRICS,
          asyncRecoveryEnabled: true,
          runStoreEnabled: true,
          skillPackRegistry: ['vision.create', 'vision.model', 'vision.community'],
          mcpGatewayMode: 'degraded-local',
        },
      };
    },
    capabilities() {
      return {
        module: MODULE_NAME,
        enabled: true,
        strictMode: true,
        provider: 'local',
        mcpServers: ['local.agent.router', 'mock.mcp.gateway'],
        externalMcpEnabled: false,
        supportsSkillPacks: true,
        supportsExecutionStrategy: true,
        requiredEnv,
        auth: {
          required: true,
          scopes: [
            'app:read',
            'app:navigate',
            'grading:write',
            'convert:write',
            'community:*',
            'settings:write',
          ],
        },
        endpoints: [
          'POST /v1/modules/agent/plan',
          'POST /v1/modules/agent/execute',
          'POST /v1/modules/agent/runs/register',
          'GET /v1/modules/agent/runs/:runId',
          'GET /v1/modules/agent/runs/:runId/history',
          'POST /v1/modules/agent/runs/:runId/resume',
          'POST /v1/modules/agent/runs/:runId/callback',
          'POST /v1/modules/agent/runs/:runId/cancel',
          'POST /v1/modules/agent/runs/:runId/retry',
          'POST /v1/modules/agent/memory/upsert',
          'POST /v1/modules/agent/memory/query',
          'GET /v1/modules/agent/health',
        ],
      };
    },
    close() {},
  };
};

module.exports = {
  createAgentModule,
};
