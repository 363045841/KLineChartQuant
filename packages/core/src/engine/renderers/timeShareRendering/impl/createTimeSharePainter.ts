/** 分时原语提交与保留投影：单日/五日共享实现，Layer 独立持有缓存与生命周期。 */
import {
  createProjectionRevision,
  sameProjectionRevision,
} from '@/engine/frame/impl/retainedProjection.js'
import type { ProjectionRevision } from '@/engine/frame/types.js'
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import { createRetainedGeometry } from '@/rendering/scene/retainedGeometry.js'
import type { TimeShareAreaProjection, TimeShareProjection } from '../types.js'
import { projectTimeShare } from './projectTimeShare.js'

/** 捕获影响投影的分时语义；日/段按值比较，允许帧准备重新包装几何对象。 */
function revision(context: PrimitiveRenderContext): ProjectionRevision {
  const geometry = context.timeShareGeometry
  return createProjectionRevision(context, [
    context.dataRevision,
    context.dataView,
    context.timeShareBaseline,
    geometry?.contentWidth,
    geometry?.sessionSlots,
    geometry?.days.length,
    geometry?.segments.length,
    ...(geometry?.days.flatMap((day) => [
      day.startX,
      day.endX,
      day.dataStartIndex,
      day.dataEndIndex,
    ]) ?? []),
    ...(geometry?.segments.flatMap((segment) => [segment.dataStartIndex, segment.dataEndIndex]) ??
      []),
  ])
}

/** 绑定单侧面积的颜色、透明度渐变与横向偏移；不改动已保留的几何。 */
function areaPrimitive(
  area: TimeShareAreaProjection,
  color: string,
  offsetX: number,
): PaintPrimitive {
  return {
    kind: 'fill',
    paths: area.paths,
    band: true,
    color,
    offsetX,
    fade: { fromY: area.fromY, toY: area.toY },
  }
}

/** 创建仅提交公共原语的绘制器；无数据版本的独立绘制每次重新投影。 */
export function createTimeSharePainter() {
  const retained = createRetainedGeometry<TimeShareProjection, ProjectionRevision>(
    sameProjectionRevision,
  )
  return {
    paint(context: PrimitiveRenderContext): void {
      if (context.dataRevision === undefined) retained.clear()
      const geometry =
        context.dataRevision === undefined
          ? projectTimeShare(context)
          : retained.read(revision(context), () => projectTimeShare(context))
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const offsetX = context.scrollLeft
      const commands: PaintPrimitive[] = []
      for (const baseline of geometry.baselines) {
        commands.push({
          kind: 'stroke',
          paths: [baseline],
          color: colors.timeSharePreClose,
          width: 1,
          dash: [4, 4],
          offsetX,
        })
      }
      for (const segment of geometry.segments) {
        if (segment.up) commands.push(areaPrimitive(segment.up, colors.timeShareAreaUp, offsetX))
        if (segment.down)
          commands.push(areaPrimitive(segment.down, colors.timeShareAreaDown, offsetX))
        commands.push(
          {
            kind: 'stroke',
            paths: [segment.price],
            color: colors.timeSharePriceLine,
            width: 1,
            join: 'round',
            cap: 'round',
            offsetX,
          },
          {
            kind: 'stroke',
            paths: [segment.average],
            color: colors.timeShareAvgLine,
            width: 1,
            join: 'round',
            cap: 'round',
            offsetX,
          },
        )
      }
      submitPrimitives(context, commands, context.dpr)
    },
    dispose(): void {
      retained.clear()
    },
  }
}
