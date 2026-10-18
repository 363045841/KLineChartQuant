/** 足迹专用 Worker 入口；不加载指标注册表或指标计算器映射。 */
import { createFootprintExecution } from './footprintExecution.js'
import type { FootprintWorkerRequest } from '../types.js'

const execute = createFootprintExecution()
self.onmessage = (event: MessageEvent<FootprintWorkerRequest>) => {
  self.postMessage(execute(event.data))
}
