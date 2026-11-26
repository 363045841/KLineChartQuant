/** 控制器测试夹具：用例显式注入定义注册表与行情宿主，夹具只负责装配 runtime。 */
import { createMarketDataHost } from '@/data/management/impl/context.js'
import { createTestDefinitions } from '@/engine/indicators/__tests__/helpers/definitionsTestKit.js'
import type { DefinitionRegistry } from '@/engine/indicators/registry/index.js'
import { createMarketRuntime } from '@/engine/runtime/index.js'
import { createChartController } from '../../chart/index.js'
import type { ChartController, ChartMountOptions } from '../../types.js'
import type { MarketDataContext } from '@/data/management/impl/context.js'

/** 测试挂载参数：与生产选项一致，额外要求调用方自持 runtime 的两个依赖。 */
export type TestMountOptions = Omit<ChartMountOptions, 'runtime'> & {
  /** 本次用例的定义注册表；缺省为一份全新的空表。 */
  readonly definitions?: DefinitionRegistry
  /** 本次用例的行情宿主；缺省为内置数据源宿主。 */
  readonly market?: MarketDataContext
}

/**
 * 创建控制器；runtime 由用例提供的行情与定义装配。
 *
 * @param options 挂载参数与 runtime 依赖
 * @returns 图表控制器
 */
export function createTestChartController(options: TestMountOptions): Promise<ChartController> {
  const {
    definitions = createTestDefinitions(),
    market = createMarketDataHost(),
    ...rest
  } = options
  return createChartController({
    ...rest,
    runtime: createMarketRuntime({ market, definitions }),
  })
}
