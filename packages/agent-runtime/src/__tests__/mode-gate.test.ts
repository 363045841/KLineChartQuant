/** Plan 模式 gate：工具表不变，写工具在执行期被拒绝。 */
import { describe, expect, it, vi } from 'vitest'
import { PLAN_MODE_READ_ONLY, withModeGate } from '../host/impl/mode-gate.js'
import type { RuntimeToolDefinition, RuntimeToolResult } from '../pi/types.js'

/** 构造一只最小工具；effect 决定 gate 是否命中。 */
function tool(
  effect: 'read' | 'write',
  execute: RuntimeToolDefinition['execute'],
): RuntimeToolDefinition {
  return {
    name: `${effect}.tool`,
    label: effect,
    description: effect,
    parameters: { type: 'object' },
    effect,
    executionMode: effect === 'read' ? 'parallel' : 'sequential',
    execute,
  }
}

/** 工具执行上下文；gate 只读取 signal。 */
const context = () => ({
  sessionId: 'session',
  runId: 'run',
  toolCallId: 'call',
  signal: new AbortController().signal,
  progress: () => undefined,
})

describe('withModeGate', () => {
  it('build 模式与 read 工具保持原定义', async () => {
    const execute = vi.fn(
      async (): Promise<RuntimeToolResult> => ({ content: 'ok', summary: 'ok' }),
    )
    const write = tool('write', execute)
    const read = tool('read', execute)

    expect(withModeGate(write, 'build')).toBe(write)
    expect(withModeGate(read, 'plan')).toBe(read)
    await withModeGate(write, 'build').execute({}, context())
    await withModeGate(read, 'plan').execute({}, context())
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('plan 模式拒绝写工具且不执行原实现', async () => {
    const execute = vi.fn(
      async (): Promise<RuntimeToolResult> => ({ content: 'ok', summary: 'ok' }),
    )
    const gated = withModeGate(tool('write', execute), 'plan')

    const result = await gated.execute({}, context())

    expect(execute).not.toHaveBeenCalled()
    expect(gated.effect).toBe('write')
    expect(result.failure?.code).toBe(PLAN_MODE_READ_ONLY)
    expect(result.failure?.retryable).toBe(false)
    expect(result.content).toContain(PLAN_MODE_READ_ONLY)
    expect(result.summary).toContain('read-only')
  })

  it('取消信号在拒绝前生效', async () => {
    const controller = new AbortController()
    controller.abort()
    const gated = withModeGate(
      tool('write', async () => ({ content: '', summary: '' })),
      'plan',
    )

    await expect(gated.execute({}, { ...context(), signal: controller.signal })).rejects.toThrow()
  })
})
