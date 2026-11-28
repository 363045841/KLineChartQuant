import { batch, createSignal, type ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { ChartDom } from '../chart/types.js'
import type { ChartPaneLayout } from '../pane/index.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import { layoutAxisColumns } from './impl/axisColumns.js'
import { resolveAxisWidth } from './impl/axisWidths.js'
import type { AxisWidths } from './types.js'

export class ChartAxisColumns {
  private locked = false
  private readonly leftWidth
  private readonly rightWidth
  readonly left: ReadonlySignal<number>
  readonly right: ReadonlySignal<number>

  constructor(
    private readonly options: OptionsStateModule['readonly']['options'],
    private readonly layout: ChartPaneLayout,
    private readonly dom: ChartDom,
    private readonly defaultLabelWidth: number,
  ) {
    const initial = options.peek()
    this.left = this.leftWidth = createSignal(initial.leftAxisWidth)
    this.right = this.rightWidth = createSignal(initial.rightAxisWidth + (initial.priceLabelWidth ?? defaultLabelWidth))
  }

  unlock(): void {
    this.locked = false
  }

  commit(widths: AxisWidths): boolean {
    const options = this.options.peek()
    const previousLeft = this.left.peek()
    const previousRight = this.right.peek()
    const left = resolveAxisWidth(options.leftAxisWidth, widths.left, this.locked ? previousLeft : null)
    const rightFloor = options.rightAxisWidth + (options.priceLabelWidth ?? this.defaultLabelWidth)
    const right = resolveAxisWidth(rightFloor, widths.right, this.locked ? previousRight : null)
    this.locked = true

    const columns = new Map(this.layout.getPaneRenderers().map((renderer) => {
      const pane = renderer.getPane()
      return [pane.id, layoutAxisColumns(pane.axes.map((axis) => axis.axisId), widths.rightByAxis, right)] as const
    }))
    this.layout.commitAxisColumns(columns)
    batch(() => {
      this.leftWidth.set(left)
      this.rightWidth.set(right)
    })
    if (this.dom.leftAxisLayer) this.dom.leftAxisLayer.style.width = `${left}px`
    if (this.dom.rightAxisLayer) this.dom.rightAxisLayer.style.width = `${right}px`
    return previousLeft !== left || previousRight !== right
  }
}
