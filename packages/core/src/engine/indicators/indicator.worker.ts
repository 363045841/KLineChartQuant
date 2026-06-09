/**
 * Indicator Worker 入口
 * 运行在独立线程，负责指标计算
 */

import type {
    IndicatorWorkerRequest,
    IndicatorWorkerResponse,
    IndicatorConfigSnapshot,
    SerializedRuntimeDescriptor,
} from './workerProtocol'
import { PROTOCOL_VERSION } from './workerProtocol'
import type { KLineData } from '../../types/price'
import { IndicatorRuntime, CALCULATOR_MAP, createWorkerCompute } from './indicatorRuntime'
import type { IndicatorRuntimeDescriptor } from './indicatorMetadata'

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
function handleInit(msg?: { descriptors?: SerializedRuntimeDescriptor[] }): void {
    const serializedDescs = msg?.descriptors ?? []
    const descriptors: IndicatorRuntimeDescriptor[] = serializedDescs.map(d => ({
        configKey: d.configKey as any,
        paneIdKey: d.paneIdKey as any,
        defaultConfig: d.defaultConfig,
        computeKey: d.computeKey,
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
        defaultConfig: descriptor.defaultConfig,
        computeKey: descriptor.computeKey,
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
function handleSetConfig(config: Partial<IndicatorConfigSnapshot>, version: number): void {
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
function handleComputeSeries(requestId: number, dataVersion: number, configVersion: number): void {
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
        const computeMs = performance.now() - startTime
        console.log(`[IndicatorWorker] computeSeries DONE in ${computeMs.toFixed(1)}ms, changed=[${results._changed.join(',')}]`)

        postResponse({
            type: 'seriesResult',
            requestId,
            dataVersion,
            configVersion,
            results,
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
            handleInit(msg)
            break

        case 'addDescriptor':
            handleAddDescriptor(msg.descriptor)
            break

        case 'setData':
            handleSetData(msg.data, msg.dataVersion)
            break

        case 'setConfig':
            handleSetConfig(msg.configs, msg.configVersion)
            break

        case 'computeSeries':
            handleComputeSeries(msg.requestId, msg.dataVersion, msg.configVersion)
            break

        case 'dispose':
            handleDispose()
            break

        default: {
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
