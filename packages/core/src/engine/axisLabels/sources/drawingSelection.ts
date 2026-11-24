/** 当前生效的绘图标签：正式投影与会话投影已在边界合并，这里只做直通。 */

import type { AxisLabel, AxisLabelScope, AxisLabelSource } from '../types.js'

export const drawingSelectionSource: AxisLabelSource = {
  collect(scope: AxisLabelScope): readonly AxisLabel[] {
    return scope.drawingLabels
  },
}
