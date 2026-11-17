// 工作区状态的创建与整体替换：会话内容只来自官方读取结果，提问状态只在这里变更。
import type { AgentTranscriptView, QuestionAnswerView, QuestionView } from '../../agent-contracts.js'
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

/**
 * 切换当前会话，并清空上一会话的内容与待答提问。
 * @param state 当前工作区状态。
 * @param sessionId 目标会话标识。
 * @returns 新的工作区状态。
 */
export function activateSession(
  state: AgentWorkspaceState,
  sessionId: string,
): AgentWorkspaceState {
  if (state.activeSessionId === sessionId) return state
  return { ...state, activeSessionId: sessionId, transcript: null, questions: [] }
}

/**
 * 登记宿主发来的新提问。
 * @param state 当前工作区状态。
 * @param question 待答提问。
 * @returns 新的工作区状态。
 */
export function addQuestion(
  state: AgentWorkspaceState,
  question: QuestionView,
): AgentWorkspaceState {
  return { ...state, questions: [...state.questions, question] }
}

/**
 * 结算一次提问；未知提问原样返回，避免无变更的重新渲染。
 * @param state 当前工作区状态。
 * @param resolution 提问标识、结算状态与可选答复。
 * @returns 新的工作区状态。
 */
export function settleQuestion(
  state: AgentWorkspaceState,
  resolution: {
    readonly questionId: string
    readonly status: 'answered' | 'cancelled'
    readonly answer?: QuestionAnswerView
  },
): AgentWorkspaceState {
  if (!state.questions.some((question) => question.id === resolution.questionId)) return state
  return {
    ...state,
    questions: state.questions.map((question) =>
      question.id === resolution.questionId
        ? {
            ...question,
            status: resolution.status,
            ...(resolution.answer === undefined ? {} : { answer: resolution.answer }),
          }
        : question,
    ),
  }
}
