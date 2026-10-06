/** 自动扫描 @Indicator 生成；请修改定义类，不要手动编辑。 */
import { ExtremaMarkersIndicatorDefinition as Definition0 } from '../../renderers/extremaMarkers.js'
import { FiveDayTimeShareIndicatorDefinition as Definition1 } from '../../renderers/fiveDayTimeShare.js'
import { LastPriceLabelRegistrarIndicatorDefinition as Definition2 } from '../../renderers/lastPrice.js'
import { LastPriceLineIndicatorDefinition as Definition3 } from '../../renderers/lastPrice.js'
import { TimeShareIndicatorDefinition as Definition4 } from '../../renderers/timeShare.js'
import { registerIndicatorDefinition } from '../indicatorDefinitionRegistry.js'

/** 在状态投影前自动装配系统定义，重复调用由目录去重。 */
export function registerBuiltinRenderers(): void {
  registerIndicatorDefinition(Definition0)
  registerIndicatorDefinition(Definition1)
  registerIndicatorDefinition(Definition2)
  registerIndicatorDefinition(Definition3)
  registerIndicatorDefinition(Definition4)
}
