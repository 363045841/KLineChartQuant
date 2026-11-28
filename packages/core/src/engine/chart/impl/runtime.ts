/** 图表实例的运行时注入；计算会话与市场时段由宿主提供。 */

import type { MarketDataContext } from '../../../data/management/context.js'
import type { CalculationHub } from '../../calculation/index.js'
import type { DefinitionRegistry } from '../../indicators/registry/index.js'
import type { MarketSessionRegistry } from '../../../foundation/config/marketSession/marketSessionRegistry.js'
import type { ChartSettings } from '../../../foundation/config/chartSettings.js'
import type { RendererHost } from '../../../rendering/render/index.js'

export interface ChartRuntime {
  rendererHost?: RendererHost
  initialSettings?: Partial<ChartSettings>
  /** 会话级计算中枢；图表只创建 client，不拥有中枢。 */
  readonly calculationHub: CalculationHub
  /** 会话级市场时段表；图表与计算行情共用同一份。 */
  readonly marketSessionRegistry: MarketSessionRegistry
  /** 指标与警报定义注册表；图表只读取已提交定义。 */
  readonly definitions: DefinitionRegistry
  readonly marketDataContext: MarketDataContext
  /** 唯一取数服务；数据加载与实时订阅都从这里来。 */
  readonly data: import('../../../data/service/index.js').MarketDataService
  /** 帧时间源，测试或宿主可注入 Unix 毫秒时钟。 */
  clock?: import('../../../foundation/utils/clock.js').Clock
}
