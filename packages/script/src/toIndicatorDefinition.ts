/**
 * toIndicatorDefinition：把脚本作者写的 IndicatorDef 收敛为中立 IndicatorDefinition。
 *
 * 逐 bar 的 onBar 在这里被包装成 compute 端口，消费方无需了解脚本的执行模型。
 */
import type { IndicatorDefinition } from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorDef } from './contracts/script.js'
import { executeScript } from './engine/impl/executeScript.js'

/** 由脚本定义派生中立指标定义；compute 复用已有行情执行脚本。 */
export function toIndicatorDefinition<P>(def: IndicatorDef<P>): IndicatorDefinition<P> {
  return {
    name: def.name,
    displayName: def.displayName,
    pane: def.pane,
    source: 'script',
    inputs: def.inputs,
    compute: (bars, params) => executeScript(def, bars, params),
  }
}
