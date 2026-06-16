import type { DataFetcherDefinitionConfig, DataFetcherDefinition, DataFetcherFn } from './types'

type DataFetcherClass = {
  new(...args: never[]): unknown
  fetcher: DataFetcherFn
}

const definitions = new Map<string, DataFetcherDefinition>()

export function DataFetcher(config: DataFetcherDefinitionConfig) {
  return function <T extends DataFetcherClass>(value: T, context: ClassDecoratorContext<T>): T {
    context.addInitializer(function (this: T) {
      if (typeof this.fetcher !== 'function') {
        throw new Error(
          `[DataFetcher] '${config.name}' definition must expose static fetcher`,
        )
      }
      definitions.set(config.name, {
        ...config,
        fetcher: this.fetcher,
      })
    })
    return value
  }
}

export function getRegisteredFetcher(
  name: string,
): DataFetcherDefinition | undefined {
  return definitions.get(name)
}

export function getRegisteredFetchers(): DataFetcherDefinition[] {
  return Array.from(definitions.values())
}

export function fetcherHasCapability(name: string, capability: string): boolean {
  return definitions.get(name)?.capabilities?.includes(capability) ?? false
}

export function fetcherSupportsPeriod(name: string, period: string): boolean {
  const def = definitions.get(name)
  if (!def) return false
  if (!def.capabilities || def.capabilities.length === 0) return false
  return def.capabilities.includes('*') || def.capabilities.includes(period)
}

export function clearRegisteredFetchersForTest(): void {
  definitions.clear()
}
