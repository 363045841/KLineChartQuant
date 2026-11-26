/** 工作台运行时注入：图表与警报面板只消费同一份运行时。 */
import type {
  AlertService,
  DefinitionRegistry,
  MarketRuntime,
} from '@363045841yyt/klinechart-core'
import { inject, provide, type ShallowRef } from 'vue'

export interface AppRuntime {
  readonly market: MarketRuntime
  readonly definitions: DefinitionRegistry
  readonly alerts: ShallowRef<AlertService | null>
}

const APP_RUNTIME_KEY = Symbol('klinechart.app-runtime')

/** 向下层提供运行时；只允许 Composition Root 调用。 */
export function provideAppRuntime(runtime: AppRuntime): AppRuntime {
  provide(APP_RUNTIME_KEY, runtime)
  return runtime
}

/** 读取当前运行时；未提供时明确失败，不回退到全局实例。 */
export function useAppRuntime(): AppRuntime {
  const runtime = inject<AppRuntime>(APP_RUNTIME_KEY)
  if (!runtime) throw new Error('App runtime is not provided')
  return runtime
}

/** 读取当前运行时；独立图表可以没有警报面板。 */
export function tryUseAppRuntime(): AppRuntime | null {
  return inject<AppRuntime>(APP_RUNTIME_KEY) ?? null
}
