/** Vue 测试共享的最小图元夹具；仅供 __tests__ 与组件用例消费。 */

import type { DrawingObject } from '@363045841yyt/klinechart-core/controllers'

/** 构造最小图元；locked 缺省表示未锁定。 */
export function createDrawingObject(id: string, locked?: boolean): DrawingObject {
  return {
    id,
    kind: 'trend-line',
    paneId: 'main',
    visible: true,
    ...(locked === undefined ? {} : { locked }),
    anchors: [],
    params: {},
    style: {},
  }
}
