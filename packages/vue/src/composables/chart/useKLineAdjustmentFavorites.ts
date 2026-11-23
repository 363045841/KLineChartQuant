/**
 * 复权方式收藏：设备级偏好，页面内所有图表共用一份状态。
 * 只影响入口呈现，不参与品种切换与布局文档。
 */

import {
  isKLineAdjustment,
  type KLineAdjustment,
} from '@363045841yyt/klinechart-core/market-data'
import { createOptionFavoritesStore, type OptionFavoritesState } from './useOptionFavorites.js'

const store = createOptionFavoritesStore<KLineAdjustment>({
  storageKey: 'chart.kLineAdjustmentFavorites',
  isValidOption: isKLineAdjustment,
})

/** 收藏状态与切换入口；切换会同步写入设备偏好。 */
export type KLineAdjustmentFavoritesState = OptionFavoritesState<KLineAdjustment>

/** 宿主可为子树注入自己的收藏状态；未注入时回落到模块级共享实例。 */
export const KLINE_ADJUSTMENT_FAVORITES_KEY = store.key

/** 创建一份复权收藏状态；storage 供测试注入。 */
export const createKLineAdjustmentFavorites = store.create

/** 读取复权收藏状态：注入优先，否则使用模块级共享实例。 */
export const useKLineAdjustmentFavorites = store.use
