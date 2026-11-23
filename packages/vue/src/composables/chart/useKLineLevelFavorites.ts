/**
 * K 线级别收藏：设备级偏好，页面内所有图表共用一份状态。
 * 只影响入口呈现，不参与周期切换与布局文档。
 */

import { isKLineLevel, type KLineLevel } from '@vue-src/components/toolbar/kLineLevel.js'
import { createOptionFavoritesStore, type OptionFavoritesState } from './useOptionFavorites.js'

const store = createOptionFavoritesStore<KLineLevel>({
  storageKey: 'chart.kLineLevelFavorites',
  isValidOption: isKLineLevel,
})

/** 收藏状态与切换入口；切换会同步写入设备偏好。 */
export type KLineLevelFavoritesState = OptionFavoritesState<KLineLevel>

/** 宿主可为子树注入自己的收藏状态；未注入时回落到模块级共享实例。 */
export const KLINE_LEVEL_FAVORITES_KEY = store.key

/** 创建一份级别收藏状态；storage 供测试注入。 */
export const createKLineLevelFavorites = store.create

/** 读取级别收藏状态：注入优先，否则使用模块级共享实例。 */
export const useKLineLevelFavorites = store.use
