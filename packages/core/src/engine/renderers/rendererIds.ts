/**
 * 系统渲染层的静态身份：图层名与 layer id 只在这里声明。
 *
 * 渲染器创建、运行时可用列表、对象树与自动范围都按同一份身份寻址；
 * 改名时只改这里，避免同一个字符串在多个模块里各写一遍。
 */

import { objectAxisId } from '../../foundation/geometry/axisBinding.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'

/** 品种行情的稳定身份；沿用存档键 candle，显示形态不改变该身份。 */
export const CANDLE_RENDERER_NAME = 'candle'

/** 品种行情主层身份；K 线、分时、五日分时和足迹共用。 */
export const CANDLE_LAYER_ID = makePluginLayerId(CANDLE_RENDERER_NAME)
/** 品种行情独有轴，显示形态和所属 Pane 均不改变此身份。 */
export const PRICE_SERIES_AXIS_ID = objectAxisId(CANDLE_LAYER_ID)

/** 原生比较折线的图层名。 */
export const COMPARISON_LINE_RENDERER_NAME = 'comparisonLine'

/** 原生比较折线的图层身份。 */
export const COMPARISON_LINE_LAYER_ID = makePluginLayerId(COMPARISON_LINE_RENDERER_NAME)
