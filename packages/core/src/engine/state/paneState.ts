/** 按视图工作区保存主图/副图布局、比例与坐标轴状态。 */
import {
  batch,
  computed,
  createSubState,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal.js'
import { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import type { ScaleType } from '../../foundation/types/scaleType.js'
import type { LayoutWorkspaces } from '../layout/index.js'
import type { PaneSpec } from '../pane/types.js'
import { MAIN_PANE_ID } from '../pane/types.js'
import { immutableMap } from './immutable.js'
import type { IndicatorInstanceSpec } from './indicatorState.js'

/** 从指标定义派生的实例生成 Pane，保存的规格仅提供顺序、尺寸和可见性。 */
function projectWorkspace(
  workspace: PaneWorkspace,
  instances: ReadonlyArray<IndicatorInstanceSpec>,
): PaneWorkspace {
  const required = new Set(
    instances.filter((instance) => instance.role === 'sub').map((instance) => instance.paneId),
  )
  const main = workspace.paneSpecs.find((spec) => spec.id === MAIN_PANE_ID) ?? {
    id: MAIN_PANE_ID,
    ratio: 1,
    visible: true,
    role: 'price' as const,
  }
  const specs = [
    main,
    ...workspace.paneSpecs.filter(
      (spec) => spec.id !== MAIN_PANE_ID && (spec.role === 'price' || required.has(spec.id)),
    ),
  ]
  const present = new Set(specs.map((spec) => spec.id))
  const missing = [...required]
    .filter((id) => !present.has(id))
    .map((id) => ({ id, ratio: 1, role: 'indicator' as const }))
  const projectedSpecs = [...specs, ...missing]
  const ratios = Object.fromEntries(
    projectedSpecs.map((spec) => [spec.id, workspace.paneRatios[spec.id] ?? spec.ratio]),
  )
  const scales = new Map(
    [...workspace.paneScaleTypes].filter(([id]) => projectedSpecs.some((spec) => spec.id === id)),
  )
  return snapshotWorkspace(ratios, projectedSpecs, scales)
}

function copyRatios(ratios: Readonly<Record<string, number>>): Record<string, number> {
  return { ...ratios }
}

function copySpecs(specs: ReadonlyArray<PaneSpec>): PaneSpec[] {
  return specs.map((spec) => ({
    ...spec,
    ...(spec.capabilities ? { capabilities: { ...spec.capabilities } } : {}),
  }))
}

function scaleMapsEqual(
  left: ReadonlyMap<string, ScaleType>,
  right: ReadonlyMap<string, ScaleType>,
): boolean {
  if (left.size !== right.size) return false
  for (const [id, type] of right) {
    if (left.get(id) !== type) return false
  }
  return true
}

type PaneWorkspace = Readonly<{
  paneRatios: Readonly<Record<string, number>>
  paneSpecs: ReadonlyArray<PaneSpec>
  paneScaleTypes: ReadonlyMap<string, ScaleType>
}>

const EMPTY_WORKSPACE: PaneWorkspace = Object.freeze({
  paneRatios: Object.freeze({}),
  paneSpecs: Object.freeze([]),
  paneScaleTypes: immutableMap(new Map()),
})

function snapshotWorkspace(
  ratios: Readonly<Record<string, number>>,
  specs: ReadonlyArray<PaneSpec>,
  scaleTypes: ReadonlyMap<string, ScaleType>,
): PaneWorkspace {
  return Object.freeze({
    paneRatios: Object.freeze(copyRatios(ratios)),
    paneSpecs: Object.freeze(copySpecs(specs)),
    paneScaleTypes: immutableMap(new Map(scaleTypes)),
  })
}

/** 当前工作区的派生接口保持既有消费方不变。 */
export function createPaneState(
  indicatorWorkspaces: ReadonlySignal<
    Readonly<Record<ChartWorkspaceId, ReadonlyArray<IndicatorInstanceSpec>>>
  >,
) {
  const { signals, readonly: stored } = createSubState({
    activeWorkspace: ChartWorkspaceId.KLine as ChartWorkspaceId,
    workspaces: Object.freeze({
      kline: EMPTY_WORKSPACE,
      timeshare: EMPTY_WORKSPACE,
    }) as Readonly<Record<ChartWorkspaceId, PaneWorkspace>>,
  })
  const workspaces = computed(() =>
    Object.freeze({
      kline: projectWorkspace(stored.workspaces().kline, indicatorWorkspaces().kline),
      timeshare: projectWorkspace(stored.workspaces().timeshare, indicatorWorkspaces().timeshare),
    }),
  )
  const readonly = {
    ...stored,
    workspaces,
    paneSpecs: computed(() => workspaces()[stored.activeWorkspace()].paneSpecs),
    paneRatios: computed(() => workspaces()[stored.activeWorkspace()].paneRatios),
    paneScaleTypes: computed(() => workspaces()[stored.activeWorkspace()].paneScaleTypes),
  }
  const currentWorkspace = (): PaneWorkspace =>
    stored.workspaces.peek()[stored.activeWorkspace.peek()]

  const writeActive = (next: PaneWorkspace): void => {
    const workspaceId = readonly.activeWorkspace.peek()
    batch(() => {
      signals.workspaces.set(Object.freeze({ ...stored.workspaces.peek(), [workspaceId]: next }))
    })
  }
  const writeScaleTypes = (next: ReadonlyMap<string, ScaleType>): void => {
    const current = currentWorkspace()
    if (scaleMapsEqual(current.paneScaleTypes, next)) return
    writeActive(snapshotWorkspace(current.paneRatios, current.paneSpecs, next))
  }

  return {
    readonly,
    /** 命令读取当前轴偏好，batch 内不依赖延迟更新的布局投影。 */
    getScalePreferences: (): ReadonlyMap<string, ScaleType> => currentWorkspace().paneScaleTypes,
    actions: {
      setActiveWorkspace(workspaceId: ChartWorkspaceId): void {
        if (signals.activeWorkspace.peek() === workspaceId) return
        batch(() => {
          signals.activeWorkspace.set(workspaceId)
        })
      },
      /** 用已校验的持久快照恢复两个工作区的布局与坐标轴类型。 */
      restoreWorkspaces(workspaces: LayoutWorkspaces): void {
        const next = Object.freeze({
          kline: snapshotWorkspace(
            workspaces.kline.paneRatios,
            workspaces.kline.paneSpecs.map((spec) => ({
              ...spec,
              role: spec.id === 'main' ? 'price' : 'indicator',
            })),
            new Map(Object.entries(workspaces.kline.paneScaleTypes)),
          ),
          timeshare: snapshotWorkspace(
            workspaces.timeshare.paneRatios,
            workspaces.timeshare.paneSpecs.map((spec) => ({
              ...spec,
              role: spec.id === 'main' ? 'price' : 'indicator',
            })),
            new Map(Object.entries(workspaces.timeshare.paneScaleTypes)),
          ),
        })
        batch(() => {
          signals.workspaces.set(next)
        })
      },
      setPaneRatios(ratios: Record<string, number>): void {
        const current = currentWorkspace()
        writeActive(snapshotWorkspace(ratios, current.paneSpecs, current.paneScaleTypes))
      },
      setPaneSpecs(specs: PaneSpec[]): void {
        const current = currentWorkspace()
        writeActive(snapshotWorkspace(current.paneRatios, specs, current.paneScaleTypes))
      },
      /** ratios、specs 与保留的坐标轴类型同批发布，避免中间态。 */
      commitLayout(ratios: Readonly<Record<string, number>>, specs: ReadonlyArray<PaneSpec>): void {
        const prev = currentWorkspace().paneScaleTypes
        const next = new Map<string, ScaleType>()
        for (const spec of specs) {
          const existing = prev.get(spec.id)
          if (existing !== undefined) next.set(spec.id, existing)
        }
        batch(() => writeActive(snapshotWorkspace(ratios, specs, next)))
      },
      setPaneScaleType(paneId: string, scaleType: ScaleType): void {
        const prev = currentWorkspace().paneScaleTypes
        if (prev.get(paneId) === scaleType) return
        const next = new Map(prev)
        next.set(paneId, scaleType)
        writeScaleTypes(immutableMap(next))
      },
      replacePaneScaleTypes(types: ReadonlyMap<string, ScaleType>): void {
        writeScaleTypes(immutableMap(new Map(types)))
      },
      removePaneScaleType(paneId: string): void {
        const prev = currentWorkspace().paneScaleTypes
        if (!prev.has(paneId)) return
        const next = new Map(prev)
        next.delete(paneId)
        writeScaleTypes(immutableMap(next))
      },
    },
    dispose(): void {
      batch(() => {
        signals.activeWorkspace.set(ChartWorkspaceId.KLine)
        signals.workspaces.set(
          Object.freeze({ kline: EMPTY_WORKSPACE, timeshare: EMPTY_WORKSPACE }),
        )
      })
    },
  }
}

export type PaneStateModule = ReturnType<typeof createPaneState>
