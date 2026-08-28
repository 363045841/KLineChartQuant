/**
 * Indicator Worker 入口
 * 运行在独立线程，负责指标计算
 */

import type { KLineData } from '../../foundation/types/price'

import type { IndicatorRuntimeDescriptor } from './indicatorMetadata'
import { IndicatorRuntime, CALCULATOR_MAP, createWorkerCompute } from './indicatorRuntime'
import type {
  IndicatorWorkerRequest,
  IndicatorWorkerResponse,
  IndicatorConfigSnapshot,
  SerializedRuntimeDescriptor,
} from './workerProtocol'
import { PROTOCOL_VERSION } from './workerProtocol'

// Worker 全局作用域
const ctx = self as unknown as Worker

// 运行时实例
let runtime: IndicatorRuntime | null = null

/**
 * 发送响应到主线程
 */
function postResponse(response: IndicatorWorkerResponse): void {
  ctx.postMessage(response)
}

/**
 * 处理初始化
 */
function handleInit(msg?: { descriptors?: ReadonlyArray<SerializedRuntimeDescriptor> }): void {
  const serializedDescs = msg?.descriptors ?? []
  const descriptors: IndicatorRuntimeDescriptor[] = serializedDescs.map((d) => ({
    configKey: d.configKey as any,
    paneIdKey: d.paneIdKey as any,
    defaultParams: d.defaultParams,
    computeKey: d.computeKey,
    outputAlignment: d.outputAlignment,
    compute: createWorkerCompute(d),
  }))
  runtime = new IndicatorRuntime(descriptors)
  postResponse({
    type: 'ready',
    protocolVersion: PROTOCOL_VERSION,
  })
}

function handleAddDescriptor(descriptor: SerializedRuntimeDescriptor): void {
  if (!runtime) {
    postResponse({
      type: 'error',
      stage: 'init',
      message: 'Runtime not initialized',
    })
    return
  }
  runtime.addDescriptor({
    configKey: descriptor.configKey as any,
    paneIdKey: descriptor.paneIdKey as any,
    defaultParams: descriptor.defaultParams,
    computeKey: descriptor.computeKey,
    outputAlignment: descriptor.outputAlignment,
    compute: createWorkerCompute(descriptor),
  })
}

/**
 * 处理设置数据
 */
function handleSetData(data: KLineData[], version: number): void {
  if (!runtime) {
    postResponse({
      type: 'error',
      stage: 'setData',
      message: 'Runtime not initialized',
    })
    return
  }
  runtime.setData(data, version)
}

/**
 * 处理设置配置
 */
function handleSetConfig(config: IndicatorConfigSnapshot, version: number): void {
  if (!runtime) {
    postResponse({
      type: 'error',
      stage: 'setConfig',
      message: 'Runtime not initialized',
    })
    return
  }
  runtime.setConfig(config, version)
}

/**
 * 处理计算 series
 */
function handleComputeSeries(
  requestId: number,
  dataVersion: number,
  configVersion: number,
  instances: Extract<IndicatorWorkerRequest, { type: 'computeSeries' }>['instances'],
): void {
  if (!runtime) {
    postResponse({
      type: 'error',
      requestId,
      stage: 'computeSeries',
      message: 'Runtime not initialized',
    })
    return
  }

  const startTime = performance.now()

  try {
    console.log(`[IndicatorWorker] computeSeries START reqId=${requestId}`)
    const results = runtime.computeSeries()
    const instanceResults = runtime.computeInstanceSeries(instances)
    const computeMs = performance.now() - startTime
    console.log(
      `[IndicatorWorker] computeSeries DONE in ${computeMs.toFixed(1)}ms, changed=[${results._changed.join(',')}]`,
    )

    postResponse({
      type: 'seriesResult',
      requestId,
      dataVersion,
      configVersion,
      results,
      instanceResults,
      metrics: {
        computeMs,
        dataLength: 0, // 由调用方填充
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    postResponse({
      type: 'error',
      requestId,
      stage: 'computeSeries',
      message,
    })
  }
}

/**
 * 处理销毁
 */
function handleDispose(): void {
  runtime = null
  // Worker 会被主线程 terminate，这里做清理即可
}

/**
 * 消息处理器
 */
ctx.onmessage = (event: MessageEvent<IndicatorWorkerRequest>) => {
  const msg = event.data

  if (!msg || typeof msg !== 'object') {
    postResponse({
      type: 'error',
      stage: 'init',
      message: 'Invalid message format',
    })
    return
  }

  switch (msg.type) {
    case 'init':
      // 根据主线程传入的运行时描述符创建本 Worker 的独立计算 Runtime。
      handleInit(msg)
      break

    case 'addDescriptor':
      // 为已初始化 Runtime 补充一个新注册指标，后续计算请求才能解析其 calculator。
      handleAddDescriptor(msg.descriptor)
      break

    case 'setData':
      // 缓存当前完整行情快照及其版本，计算请求只引用该 Worker 内部快照。
      handleSetData(msg.data, msg.dataVersion)
      break

    case 'setConfig':
      // 缓存按 configKey 索引的计算参数快照及其版本，不包含展示配置。
      handleSetConfig(msg.configs, msg.configVersion)
      break

    case 'computeSeries':
      // 使用已缓存的行情和参数执行计算，并将纯计算结果返回主线程。
      handleComputeSeries(msg.requestId, msg.dataVersion, msg.configVersion, msg.instances)
      break

    case 'dispose':
      // 释放 Worker 内部 Runtime 引用，主线程随后负责终止 Worker。
      handleDispose()
      break

    default: {
      // TypeScript 理论上不可达；保留运行时错误响应以防收到越过类型检查的消息。
      const _exhaustiveCheck: never = msg
      postResponse({
        type: 'error',
        stage: 'init',
        message: `Unknown message type: ${(_exhaustiveCheck as unknown as { type: string }).type}`,
      })
    }
  }
}

// 通知主线程 worker 已加载（可选，主要用于调试）
// console.log('[IndicatorWorker] Loaded')
