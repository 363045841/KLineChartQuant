// 本文件统一装配官方持久化 Harness、模型集合和工具 Registry。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai'
import { createRegistry, Harness, type Storage } from '@earendil-works/pi-durable'
import type { DurableExecution } from '../pi/impl/run.js'

/** 打开官方运行时并返回关闭 Harness 所需的句柄。 */
export async function openDurableExecution(storage: Storage): Promise<DurableExecution> {
  const models = createModels()
  const registry = createRegistry()
  const harness = await Harness.open(storage, { models, registry }, BACKGROUND_CONTEXT)
  // 打开后显式启用调度，使提交后立即推进任务而不依赖某次等待调用。
  harness.resume()
  return { harness, models, registry }
}
