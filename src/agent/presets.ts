import type {AgentExecutionStrategy} from './dualEntryOrchestrator';

export interface AgentPresetDefinition {
  id: 'batch_grading' | 'modeling_3d' | 'community_publish';
  icon: string;
  label: string;
  summary: string;
  stageLabel: string;
  prompt: string;
  recommendedStrategy: AgentExecutionStrategy;
}

export const AGENT_PRESETS: AgentPresetDefinition[] = [
  {
    id: 'batch_grading',
    icon: 'color-palette',
    label: '批量调色',
    summary: '围绕当前调色素材生成可复用的批量调色流程，并优先执行首轮调色。',
    stageLabel: '调色工作流',
    prompt:
      '请围绕当前图片生成一个批量调色工作流，先执行 AI 首轮调色，再总结成可复用的批量调色建议。',
    recommendedStrategy: 'quality',
  },
  {
    id: 'modeling_3d',
    icon: 'cube',
    label: '3D任务',
    summary: '为当前建模素材规划并启动 2D 转 3D 任务，同时给出后续预览与下载建议。',
    stageLabel: '建模工作流',
    prompt: '请为当前图片规划并执行 2D 转 3D 建模任务，再说明预览、轮询和下载下一步。',
    recommendedStrategy: 'adaptive',
  },
  {
    id: 'community_publish',
    icon: 'paper-plane',
    label: '社区发布',
    summary: '生成社区草稿并串联发布链路，方便展示从创作到社区的闭环。',
    stageLabel: '社区工作流',
    prompt: '请规划并执行一次社区发布工作流，生成社区草稿，并在条件满足时继续发布。',
    recommendedStrategy: 'fast',
  },
];
