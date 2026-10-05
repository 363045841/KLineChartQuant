// 本文件统一装配官方持久化 Harness、模型集合和工具 Registry。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai'
import { createRegistry, Harness, type Storage } from '@earendil-works/pi-durable'
import type { DurableExecution } from '../pi/impl/durable-run-driver.js'

/** 打开官方任务运行时，宿主负责关闭 Harness。 */
export async function openDurableExecution(storage: Storage): Promise<DurableExecution> {
  const models = createModels()
  const registry = createRegistry()
  const harness = await Harness.open(storage, { models, registry }, BACKGROUND_CONTEXT)
  return { harness, models, registry }
}
