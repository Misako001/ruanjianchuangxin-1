import {
  applyClientRequiredActions,
  buildMissingContextHintText,
  executeAgentPlanCycle,
} from '../dualEntryOrchestrator';
import type {AgentExecuteResponse, AgentPlanResponse} from '../../modules/api';
import {useAgentExecutionContextStore} from '../executionContextStore';
import {defaultColorGradingParams} from '../../types/colorGrading';

jest.mock('../../modules/api', () => ({
  agentApi: {
    executePlan: jest.fn(),
    registerWorkflowRun: jest.fn(),
    resumeWorkflowRun: jest.fn(),
    cancelWorkflowRun: jest.fn(),
    createPlan: jest.fn(),
  },
  colorApi: {
    initialSuggest: jest.fn(),
  },
  communityApi: {
    uploadPostImage: jest.fn(),
    createDraft: jest.fn(),
    publishDraft: jest.fn(),
  },
}));

jest.mock('../../colorEngine/exportService', () => ({
  exportGradedResult: jest.fn(),
}));

const {agentApi} = jest.requireMock('../../modules/api') as {
  agentApi: {
    executePlan: jest.Mock;
    registerWorkflowRun: jest.Mock;
    resumeWorkflowRun: jest.Mock;
    cancelWorkflowRun: jest.Mock;
    createPlan: jest.Mock;
  };
};
const {colorApi, communityApi} = jest.requireMock('../../modules/api') as {
  colorApi: {
    initialSuggest: jest.Mock;
  };
  communityApi: {
    uploadPostImage: jest.Mock;
    createDraft: jest.Mock;
    publishDraft: jest.Mock;
  };
};
const {exportGradedResult} = jest.requireMock('../../colorEngine/exportService') as {
  exportGradedResult: jest.Mock;
};

const createAction = (overrides: Partial<AgentPlanResponse['actions'][number]> = {}) => ({
  actionId: overrides.actionId || 'a1',
  id: overrides.id || overrides.actionId || 'a1',
  domain: overrides.domain || 'app',
  operation: overrides.operation || 'summarize_current_page',
  args: overrides.args,
  riskLevel: overrides.riskLevel || 'low',
  requiresConfirmation: overrides.requiresConfirmation || false,
  requiredScopes: overrides.requiredScopes || [],
});

describe('dualEntryOrchestrator', () => {
  beforeEach(() => {
    agentApi.executePlan.mockReset();
    agentApi.registerWorkflowRun.mockReset();
    agentApi.resumeWorkflowRun.mockReset();
    agentApi.cancelWorkflowRun.mockReset();
    agentApi.createPlan.mockReset();
    colorApi.initialSuggest.mockReset();
    communityApi.uploadPostImage.mockReset();
    communityApi.createDraft.mockReset();
    communityApi.publishDraft.mockReset();
    exportGradedResult.mockReset();
    useAgentExecutionContextStore.setState({
      colorContext: null,
      modelingImageContext: null,
    });
  });

  it('auto-handles client-required navigation on client side', async () => {
    const navigateToTab = jest.fn();
    const result: AgentExecuteResponse = {
      executionId: 'e1',
      planId: 'p1',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:navigation.navigate_tab',
          errorCode: 'client_required',
          action: createAction({
            domain: 'navigation',
            operation: 'navigate_tab',
            args: {tab: 'home', route: 'grading'},
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab,
      summarizeCurrentPage: () => '',
    });

    expect(navigateToTab).toHaveBeenCalledWith('create');
    expect(normalized.status).toBe('applied');
    expect(normalized.actionResults[0].status).toBe('applied');
    expect(normalized.clientHandledActions?.length).toBe(1);
  });

  it('auto-handles summarize_current_page and returns summary text', async () => {
    const result: AgentExecuteResponse = {
      executionId: 'e2',
      planId: 'p2',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:app.summarize_current_page',
          errorCode: 'client_required',
          action: createAction({
            domain: 'app',
            operation: 'summarize_current_page',
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '当前页面：调色页；已加载调色图片上下文',
    });

    expect(normalized.status).toBe('applied');
    expect(normalized.pageSummary).toContain('当前页面');
    expect(normalized.actionResults[0].status).toBe('applied');
  });

  it('client-handles grading and community publish with current color context', async () => {
    useAgentExecutionContextStore.setState({
      colorContext: {
        locale: 'zh-CN',
        currentParams: defaultColorGradingParams,
        image: {
          mimeType: 'image/jpeg',
          width: 1200,
          height: 800,
          base64: 'ZmFrZQ==',
        },
        imageStats: {} as never,
        sourceUri: 'file:///tmp/source.jpg',
        fileName: 'source.jpg',
        nativeSourcePath: '/tmp/source.jpg',
        workingSpaceHint: 'linear_srgb',
        bitDepthHint: 8,
      },
      modelingImageContext: null,
    });
    colorApi.initialSuggest.mockResolvedValue({
      actions: [{action: 'adjust_param', target: 'contrast', delta: 12}],
      confidence: 0.91,
      needsConfirmation: false,
      fallbackUsed: false,
      reasoningSummary: 'ok',
      message: 'ok',
      source: 'cloud',
      analysisSummary: '适合轻电影感增强',
      appliedProfile: '电影感',
      sceneProfile: '人像',
    });
    exportGradedResult.mockResolvedValue({
      uri: 'file:///tmp/graded.png',
    });
    communityApi.uploadPostImage
      .mockResolvedValueOnce({url: 'https://cdn/before.jpg'})
      .mockResolvedValueOnce({url: 'https://cdn/after.png'});
    communityApi.createDraft.mockResolvedValue({
      id: 'draft-1',
      beforeUrl: 'https://cdn/before.jpg',
      afterUrl: 'https://cdn/after.png',
    });
    communityApi.publishDraft.mockResolvedValue({
      id: 'post-1',
    });

    const result: AgentExecuteResponse = {
      executionId: 'e3',
      planId: 'p3',
      status: 'client_required',
      actionResults: [
        {
          status: 'client_required',
          message: 'client_action_required:grading.apply_visual_suggest',
          errorCode: 'client_required',
          action: createAction({
            actionId: 'grade-1',
            domain: 'grading',
            operation: 'apply_visual_suggest',
          }),
        },
        {
          status: 'client_required',
          message: 'client_action_required:community.create_draft',
          errorCode: 'client_required',
          action: createAction({
            actionId: 'draft-1',
            domain: 'community',
            operation: 'create_draft',
            args: {
              title: '发布到社区',
              tags: ['AI助手'],
            },
          }),
        },
        {
          status: 'client_required',
          message: 'client_action_required:community.publish_draft',
          errorCode: 'client_required',
          action: createAction({
            actionId: 'publish-1',
            domain: 'community',
            operation: 'publish_draft',
          }),
        },
      ],
    };

    const normalized = await applyClientRequiredActions(result, {
      navigateToTab: () => undefined,
      summarizeCurrentPage: () => '',
    });

    expect(colorApi.initialSuggest).toHaveBeenCalledTimes(1);
    expect(communityApi.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeUrl: 'https://cdn/before.jpg',
        afterUrl: 'https://cdn/after.png',
      }),
    );
    expect(communityApi.publishDraft).toHaveBeenCalledWith('draft-1');
    expect(normalized.status).toBe('applied');
    expect(normalized.clientHandledActions).toHaveLength(3);
  });

  it('blocks execution when required image context is missing', async () => {
    const plan: AgentPlanResponse = {
      planId: 'p3',
      plannerSource: 'cloud',
      estimatedSteps: 1,
      reasoningSummary: 'ok',
      actions: [
        createAction({
          domain: 'grading',
          operation: 'apply_visual_suggest',
        }),
      ],
    };

    const cycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'agent',
        colorContext: null,
        modelingImageContext: null,
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => '',
      },
    });

    expect(cycle.executeResult?.status).toBe('client_required');
    expect(cycle.executeResult?.workflowRun?.status).toBe('waiting_context');
    expect(cycle.missingContextGuides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'grading.apply_visual_suggest',
          targetTab: 'create',
        }),
      ]),
    );
    expect(buildMissingContextHintText(cycle.missingContextGuides)).toContain('缺少调色图片上下文');
  });

  it('executes runnable prefix and resumes remaining actions after context is restored', async () => {
    const plan: AgentPlanResponse = {
      planId: 'p4',
      plannerSource: 'cloud',
      estimatedSteps: 3,
      reasoningSummary: 'workflow',
      actions: [
        createAction({
          actionId: 'a1',
          domain: 'navigation',
          operation: 'navigate_tab',
          args: {tab: 'home', route: 'grading'},
        }),
        createAction({
          actionId: 'a2',
          domain: 'grading',
          operation: 'apply_visual_suggest',
        }),
        createAction({
          actionId: 'a3',
          domain: 'app',
          operation: 'summarize_current_page',
        }),
      ],
    };

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-prefix',
      planId: plan.planId,
      status: 'applied',
      workflowState: {
        currentStep: 1,
        totalSteps: 1,
        nextRequiredContext: null,
      },
      actionResults: [
        {
          status: 'applied',
          message: 'ok',
          action: plan.actions[0],
        },
      ],
    });

    const firstCycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'agent',
        colorContext: null,
        modelingImageContext: null,
        latestExecuteResult: null,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => 'summary',
      },
    });

    expect(agentApi.executePlan).toHaveBeenCalledTimes(1);
    expect(agentApi.executePlan).toHaveBeenNthCalledWith(
      1,
      plan.planId,
      expect.any(Array),
      expect.objectContaining({
        actionIds: ['a1'],
      }),
    );
    expect(firstCycle.executeResult?.workflowState?.nextRequiredContext).toBe('context.color.image');
    expect(firstCycle.missingContextGuides[0]?.operation).toBe('grading.apply_visual_suggest');

    agentApi.executePlan.mockResolvedValueOnce({
      executionId: 'e-resume',
      planId: plan.planId,
      status: 'applied',
      workflowState: {
        currentStep: 3,
        totalSteps: 3,
        nextRequiredContext: null,
      },
      actionResults: [
        {
          status: 'applied',
          message: 'grading_ok',
          action: plan.actions[1],
        },
        {
          status: 'applied',
          message: 'summary_ok',
          action: plan.actions[2],
        },
      ],
    });

    const secondCycle = await executeAgentPlanCycle({
      plan,
      context: {
        currentTab: 'create',
        colorContext: {
          locale: 'zh-CN',
          currentParams: {} as never,
          image: {
            mimeType: 'image/jpeg',
            width: 100,
            height: 100,
            base64: 'ZmFrZQ==',
          },
          imageStats: {} as never,
        },
        modelingImageContext: null,
        latestExecuteResult: firstCycle.executeResult,
      },
      clientHandlers: {
        navigateToTab: () => undefined,
        summarizeCurrentPage: () => 'summary',
      },
    });

    expect(agentApi.executePlan).toHaveBeenCalledTimes(2);
    expect(agentApi.executePlan).toHaveBeenNthCalledWith(
      2,
      plan.planId,
      expect.any(Array),
      expect.objectContaining({
        actionIds: ['a2', 'a3'],
      }),
    );
    expect(secondCycle.missingContextGuides).toHaveLength(0);
    expect(secondCycle.executeResult?.status).toBe('applied');
  });
});
