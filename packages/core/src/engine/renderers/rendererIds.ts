/**
 * 系统渲染层的静态身份：图层名与 layer id 只在这里声明。
 *
 * 渲染器创建、运行时可用列表、对象树与自动范围都按同一份身份寻址；
 * 改名时只改这里，避免同一个字符串在多个模块里各写一遍。
 */

import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'

/** K 线主序列的图层名；同时也是系统对象身份。 */
export const CANDLE_RENDERER_NAME = 'candle'

/** K 线图层身份。 */
export const CANDLE_LAYER_ID = makePluginLayerId(CANDLE_RENDERER_NAME)

/** 原生比较折线的图层名。 */
export const COMPARISON_LINE_RENDERER_NAME = 'comparisonLine'

/** 原生比较折线的图层身份。 */
export const COMPARISON_LINE_LAYER_ID = makePluginLayerId(COMPARISON_LINE_RENDERER_NAME)
