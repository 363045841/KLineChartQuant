export type SceneNodeKey = string

export type RectsNode = {
  kind: 'rects'
  key: SceneNodeKey
  revision: number
  instances: Float32Array
  count: number
  color: string
  scrollLeft: number
  z: number
  paneId: string
}

export type LinesNode = {
  kind: 'lines'
  key: SceneNodeKey
  revision: number
  strips: ReadonlyArray<{
    points: ReadonlyArray<{ x: number; y: number }>
    color: string
    width?: number
  }>
  scrollLeft: number
  z: number
  paneId: string
}

export type BandNode = {
  kind: 'band'
  key: SceneNodeKey
  revision: number
  upper: ReadonlyArray<{ x: number; y: number }>
  lower: ReadonlyArray<{ x: number; y: number }>
  color: string
  alpha: number
  scrollLeft: number
  z: number
  paneId: string
}

export type SceneNode = RectsNode | LinesNode | BandNode

type StoredNode = SceneNode & {
  lastTouchedFrame: number
}

export type RetainedSceneOptions = {
  staleFrames?: number
}

export type RetainedScene = {
  beginFrame(frameNumber: number): void
  upsert(node: SceneNode): void
  collectVisible(paneId?: string): SceneNode[]
  endFrame(): void
  prune(): string[]
  clear(): void
}

export function createRetainedScene(options: RetainedSceneOptions = {}): RetainedScene {
  const staleFrames = options.staleFrames ?? 2
  const nodes = new Map<SceneNodeKey, StoredNode>()
  let frameNumber = 0

  return {
    beginFrame(nextFrameNumber): void {
      frameNumber = nextFrameNumber
    },
    upsert(node): void {
      nodes.set(node.key, {
        ...node,
        lastTouchedFrame: frameNumber,
      })
    },
    collectVisible(paneId): SceneNode[] {
      const result: SceneNode[] = []
      for (const stored of nodes.values()) {
        if (paneId !== undefined && stored.paneId !== paneId) continue
        const { lastTouchedFrame: _lastTouchedFrame, ...node } = stored
        result.push(node)
      }
      result.sort((a, b) => a.z - b.z || a.key.localeCompare(b.key))
      return result
    },
    endFrame(): void {},
    prune(): string[] {
      const removed: string[] = []
      for (const [key, stored] of nodes) {
        if (frameNumber - stored.lastTouchedFrame >= staleFrames) {
          nodes.delete(key)
          removed.push(key)
        }
      }
      return removed
    },
    clear(): void {
      nodes.clear()
    },
  }
}
