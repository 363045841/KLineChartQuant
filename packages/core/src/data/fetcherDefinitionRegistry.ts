import { KLineChartError } from '../errors'

import type {
  DataFetcherDefinitionConfig,
  DataFetcherDefinition,
  DataFetcherFn,
  TimeShareFetcherFn,
} from './types'

type DataFetcherClass = {
  new (...args: never[]): unknown
  fetcher: DataFetcherFn
  timeShareFetcher?: TimeShareFetcherFn
}

const definitions = new Map<string, DataFetcherDefinition>()

/**
 * 数据源注册装饰器
 * 通过类装饰器将数据源自动注册到全局 definitions Map
 * 使用 `import './xxx'` 副作用导入即可触发注册，无需显式引用类
 */
export function DataFetcher(config: DataFetcherDefinitionConfig) {
  return function <T extends DataFetcherClass>(value: T, context: ClassDecoratorContext<T>): T {
    // addInitializer 在类实例化时执行回调
    context.addInitializer(function (this: T) {
      // 校验：注册的数据源必须暴露静态 fetcher 方法
      if (typeof this.fetcher !== 'function') {
        throw new KLineChartError(
          'NOT_REGISTERED',
          `[DataFetcher] '${config.name}' definition must expose static fetcher`,
        )
      }
      // 将数据源名称 -> 配置 + fetcher 函数写入全局注册表
      // 之后业务代码通过 routerDataFetcher(config.name) 按名称查询
      definitions.set(config.name, {
        ...config,
        fetcher: this.fetcher,
        timeShareFetcher: this.timeShareFetcher,
      })
    })
    // 返回原类，不改变类本身
    return value
  }
}

export function getRegisteredFetcher(name: string): DataFetcherDefinition | undefined {
  return definitions.get(name)
}

export function getRegisteredFetcherNames(): string[] {
  return [...definitions.keys()]
}

function getRegisteredFetchers(): DataFetcherDefinition[] {
  return [...definitions.values()]
}

function fetcherHasCapability(name: string, capability: string): boolean {
  return definitions.get(name)?.capabilities?.includes(capability) ?? false
}

export function fetcherSupportsPeriod(name: string, period: string): boolean {
  const def = definitions.get(name)
  if (!def) return false
  if (!def.capabilities || def.capabilities.length === 0) return false
  return def.capabilities.includes('*') || def.capabilities.includes(period)
}

export function getTimeShareFetcher(name: string): TimeShareFetcherFn | undefined {
  return definitions.get(name)?.timeShareFetcher
}

export function fetcherSupportsTimeShare(name: string): boolean {
  return typeof definitions.get(name)?.timeShareFetcher === 'function'
}

export function clearRegisteredFetchersForTest(): void {
  definitions.clear()
}
