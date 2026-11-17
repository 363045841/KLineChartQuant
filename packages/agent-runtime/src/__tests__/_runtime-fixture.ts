// 运行时测试夹具：官方内存存储 + 确定性 faux Provider，暴露会话服务与事件流。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { type EntryRecord, MemoryStorage } from '@earendil-works/pi-durable'
import { AgentApplicationService } from '../application/agent-application-service.js'
import type { AgentTranscriptView } from '../contracts/ui.js'
import type { DurableExecution } from '../pi/impl/run.js'
import { openDurableExecution } from '../sessions/durable-execution.js'
import { AgentSessionService } from '../sessions/session-service.js'
import { createFauxRuntimeSupport } from '../testing/faux-runtime.js'

export interface TestRuntime {
  app: AgentApplicationService
  sessions: AgentSessionService
  execution: DurableExecution
  close(): Promise<void>
}

/** 创建一套基于官方内存存储的完整运行时。 */
export async function createTestRuntime(
  options: { configured?: boolean } = {},
): Promise<TestRuntime> {
  const execution = await openDurableExecution(new MemoryStorage())
  const support = createFauxRuntimeSupport(options)
  const sessions = new AgentSessionService({ execution })
  const app = new AgentApplicationService({
    sessions,
    createPlan: support.createPlan,
    provider: support.provider,
  })
  return {
    app,
    sessions,
    execution,
    async close() {
      await app.close()
      await execution.harness.close(BACKGROUND_CONTEXT)
    },
  }
}

/** 从读取结果中取出真实条目，过滤更早/缺失占位项。 */
export function entryItems(view: AgentTranscriptView): EntryRecord[] {
  return view.items.flatMap((item) => (item.kind === 'entry' ? [item.entry] : []))
}

/** 拼接一个条目中所有文本块。 */
export function entryText(entry: EntryRecord): string {
  return (entry.model ?? [])
    .flatMap((message) =>
      message.role === 'assistant'
        ? message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : message.role === 'user'
          ? typeof message.content === 'string'
            ? [message.content]
            : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
          : [],
    )
    .join('')
}

/**
 * 打开会话并等待读取结果满足条件。
 * @param app 应用服务。
 * @param sessionId 会话标识。
 * @param check 判定函数。
 * @param timeoutMs 超时时间。
 */
export async function waitForSession(
  app: AgentApplicationService,
  sessionId: string,
  check: (view: AgentTranscriptView) => boolean,
  timeoutMs = 8_000,
): Promise<AgentTranscriptView> {
  let unsubscribe: (() => void) | undefined
  let settled = false
  return new Promise<AgentTranscriptView>((resolve, reject) => {
    const finish = (view: AgentTranscriptView): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe?.()
      resolve(view)
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      unsubscribe?.()
      reject(new Error('Timed out waiting for the Agent session view.'))
    }, timeoutMs)
    unsubscribe = app.subscribe((event) => {
      if (event.type !== 'session.changed' || event.sessionId !== sessionId) return
      if (check(event.transcript)) finish(event.transcript)
    })
    void app.openSession(sessionId).then(
      (view) => {
        if (check(view)) finish(view)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubscribe?.()
        reject(error)
      },
    )
  })
}
