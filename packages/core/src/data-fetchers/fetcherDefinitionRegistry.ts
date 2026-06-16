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
        priority: config.priority ?? 10,
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

export function clearRegisteredFetchersForTest(): void {
  definitions.clear()
}
