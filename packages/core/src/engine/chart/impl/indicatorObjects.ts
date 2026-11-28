/**
 * 指标对象命令：对象树对指标的显隐、迁移与删除统一落到 Pane 领域命令。
 */

import type { RenderObjectCommands, RenderObjectMoveTarget } from '../../../rendering/scene/types.js'
import { INSTANCE_MOVE_KIND } from '../../pane/types.js'
import { runInNewPane } from '../../pane/impl/panePlacement.js'
import type { ChartIndicatorFacade } from '../facade/chartIndicatorFacade.js'
import type { ChartPaneFacade } from '../facade/chartPaneFacade.js'
import type { ChartStateKernel } from '../../state/chartStateKernel.js'

/** 指标对象命令所需端口。 */
export interface IndicatorObjectCommandsDeps {
  readonly kernel: Pick<ChartStateKernel, 'indicator'>
  readonly panes: ChartPaneFacade
  readonly indicators: ChartIndicatorFacade
}

/** 为一个指标实例构造对象树命令。 */
export function buildIndicatorObjectCommands(
  deps: IndicatorObjectCommandsDeps,
  instanceId: string,
): RenderObjectCommands {
  return {
    setVisible: (visible) => deps.indicators.update(instanceId, { hidden: !visible }),
    setLocked: () => false,
    move: (target) => moveIndicator(deps, instanceId, target),
    remove: () => deps.indicators.remove(instanceId),
  }
}

/** 同 Pane 换位、跨 Pane 迁移或先建 Pane 再迁移。 */
function moveIndicator(
  deps: IndicatorObjectCommandsDeps,
  instanceId: string,
  target: RenderObjectMoveTarget,
): boolean {
  const current = deps.kernel.indicator.readonly.instances
    .peek()
    .find((instance) => instance.instanceId === instanceId)
  if (current === undefined) return false
  if (target.kind === 'newPane') {
    return runInNewPane(deps.panes, target.anchorPaneId, target.placement, (paneId) =>
      deps.indicators.move(instanceId, { kind: INSTANCE_MOVE_KIND.PANE, paneId }),
    )
  }
  return deps.indicators.move(instanceId, {
    kind: INSTANCE_MOVE_KIND.PANE,
    paneId: target.paneId,
    index: target.index,
  })
}
