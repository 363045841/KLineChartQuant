// 工作区状态的创建与整体替换：会话内容只来自官方读取结果。
import type { AgentTranscriptView } from '../../agent-contracts.js'
import type { AgentWorkspaceState } from '../types.js'

/** 创建未选择会话的界面状态。 */
export function createWorkspaceState(): AgentWorkspaceState {
  return {
    sessions: [],
    activeSessionId: null,
    transcript: null,
    questions: [],
    provider: {
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: false,
      compatibility: 'unknown',
    },
  }
}

/**
 * 用官方读取结果替换当前会话内容。
 * @param state 当前工作区状态。
 * @param transcript 官方会话读取结果。
 * @returns 新的工作区状态。
 */
export function applyTranscript(
  state: AgentWorkspaceState,
  transcript: AgentTranscriptView,
): AgentWorkspaceState {
  return { ...state, transcript }
}

/**
 * 清除当前会话内容并保留目录与 Provider 状态。
 * @param state 当前工作区状态。
 * @returns 新的工作区状态。
 */
export function clearTranscript(state: AgentWorkspaceState): AgentWorkspaceState {
  return { ...state, transcript: null, questions: [] }
}
