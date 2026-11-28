import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { layoutAxisColumns } from '../axisWidth/impl/axisColumns.js'
import type { ObjectAxesApi } from '../pane/axisTypes.js'
import type { ChartPaneLayout } from '../pane/index.js'
import type { PaneStateModule } from '../state/paneState.js'
import type { RuntimeProjectionSnapshot } from './types.js'

/** 将同一份窗格和轴配置提交给渲染器与宿主。 */
export class PaneProjection {
  constructor(
    private readonly layout: ChartPaneLayout,
    private readonly state: PaneStateModule,
    private readonly axes: Pick<ObjectAxesApi, 'configuration'>,
  ) {}

  configureAxes(snapshot: RuntimeProjectionSnapshot): void {
    this.layout.setLeftAxisVisible(snapshot.leftAxisVisible, snapshot.pricePaneId)
    for (const renderer of this.layout.getPaneRenderers()) {
      const pane = renderer.getPane()
      const axes = snapshot.axes.get(pane.id)
      if (!axes) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, `Pane ${pane.id} 缺少轴投影`)
      for (const spec of axes) {
        const axis = pane.axis(spec.axisId)
        const base = snapshot.ranges[spec.axisId]?.baseValue
        if (base !== undefined) axis.setBasePrice(base)
        if (axis.getScaleType() !== spec.scaleType) axis.setScaleType(spec.scaleType)
      }
    }
  }

  publish(): void {
    this.state.actions.setPaneGeometry(this.layout.getPaneRenderers().flatMap((renderer) => {
      const pane = renderer.getPane()
      if (pane.height <= 0) return []
      const columns = layoutAxisColumns(
        pane.axes.map((axis) => axis.axisId),
        Object.fromEntries(pane.axisColumns.map((column) => [column.axisId, column.width])),
        pane.axisWidth,
      )
      pane.setAxisColumns(columns)
      return [{
        id: pane.id,
        top: pane.top,
        height: pane.height,
        axisWidth: pane.axisWidth,
        axisColumns: columns.map((column) => ({ ...column, configuration: this.axes.configuration(column.axisId) })),
      }]
    }))
  }
}
