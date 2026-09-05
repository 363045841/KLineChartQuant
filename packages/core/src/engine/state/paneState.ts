/** 按视图工作区保存主图/副图布局、比例与坐标轴状态。 */
import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { PaneSpec } from '../chartTypes'
import type { ScaleType } from '../utils/tickPosition'
import { ChartWorkspaceId } from '../../foundation/types/chartView'
import { immutableMap } from './immutable'
import type { ViewWorkspacesSnapshot } from './viewWorkspace'

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
export function createPaneState() {
  const { signals, readonly } = createSubState({
    activeWorkspace: ChartWorkspaceId.KLine as ChartWorkspaceId,
    workspaces: Object.freeze({
      kline: EMPTY_WORKSPACE,
      timeshare: EMPTY_WORKSPACE,
    }) as Readonly<Record<ChartWorkspaceId, PaneWorkspace>>,
    paneRatios: EMPTY_WORKSPACE.paneRatios,
    paneSpecs: EMPTY_WORKSPACE.paneSpecs,
    paneScaleTypes: EMPTY_WORKSPACE.paneScaleTypes,
  })
  const currentWorkspace = (): PaneWorkspace =>
    readonly.workspaces.peek()[readonly.activeWorkspace.peek()]

  const writeActive = (next: PaneWorkspace): void => {
    const workspaceId = readonly.activeWorkspace.peek()
    batch(() => {
      signals.workspaces.set(Object.freeze({ ...readonly.workspaces.peek(), [workspaceId]: next }))
      signals.paneRatios.set(next.paneRatios)
      signals.paneSpecs.set(next.paneSpecs)
      signals.paneScaleTypes.set(next.paneScaleTypes)
    })
  }
  const writeScaleTypes = (next: ReadonlyMap<string, ScaleType>): void => {
    const current = currentWorkspace()
    if (scaleMapsEqual(current.paneScaleTypes, next)) return
    writeActive(snapshotWorkspace(current.paneRatios, current.paneSpecs, next))
  }

  return {
    readonly,
    actions: {
      setActiveWorkspace(workspaceId: ChartWorkspaceId): void {
        if (signals.activeWorkspace.peek() === workspaceId) return
        const next = readonly.workspaces.peek()[workspaceId]
        batch(() => {
          signals.activeWorkspace.set(workspaceId)
          signals.paneRatios.set(next.paneRatios)
          signals.paneSpecs.set(next.paneSpecs)
          signals.paneScaleTypes.set(next.paneScaleTypes)
        })
      },
      /** 用已校验的持久快照恢复两个工作区的布局与坐标轴类型。 */
      restoreWorkspaces(workspaces: ViewWorkspacesSnapshot): void {
        const next = Object.freeze({
          kline: snapshotWorkspace(
            workspaces.kline.paneRatios,
            workspaces.kline.paneSpecs,
            new Map(Object.entries(workspaces.kline.paneScaleTypes)),
          ),
          timeshare: snapshotWorkspace(
            workspaces.timeshare.paneRatios,
            workspaces.timeshare.paneSpecs,
            new Map(Object.entries(workspaces.timeshare.paneScaleTypes)),
          ),
        })
        const active = next[readonly.activeWorkspace.peek()]
        batch(() => {
          signals.workspaces.set(next)
          signals.paneRatios.set(active.paneRatios)
          signals.paneSpecs.set(active.paneSpecs)
          signals.paneScaleTypes.set(active.paneScaleTypes)
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
        signals.paneRatios.set(EMPTY_WORKSPACE.paneRatios)
        signals.paneSpecs.set(EMPTY_WORKSPACE.paneSpecs)
        signals.paneScaleTypes.set(EMPTY_WORKSPACE.paneScaleTypes)
      })
    },
  }
}

export type PaneStateModule = ReturnType<typeof createPaneState>
