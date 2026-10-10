/** Document-owned dismissal stack for browsers without the Popover API. */
interface Layer {
  panel(): HTMLElement | null
  trigger(): HTMLElement | null
  close(restoreFocus: boolean): void
  parent?: Layer
}

interface LayerStack {
  enter(layer: Layer): void
  leave(layer: Layer): void
}

const stacks = new WeakMap<Document, LayerStack>()

function descendsFrom(layer: Layer, ancestor: Layer): boolean {
  for (let parent = layer.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return true
  }
  return false
}

function createStack(document: Document): LayerStack {
  let layers: Layer[] = []

  function closeAbove(inside?: Layer): void {
    for (const layer of [...layers].reverse()) {
      if (layer === inside) break
      layer.close(false)
    }
  }

  function onPointerDown(event: PointerEvent): void {
    const path = event.composedPath()
    const inside = [...layers]
      .reverse()
      .find((layer) =>
        [layer.panel(), layer.trigger()].some(
          (element) => element !== null && path.includes(element),
        ),
      )
    closeAbove(inside)
  }

  function onKeydown(event: KeyboardEvent): void {
    const top = layers.at(-1)
    if (event.key !== 'Escape' || !top) return
    event.preventDefault()
    event.stopPropagation()
    top.close(true)
  }

  function attach(): void {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown, true)
  }

  function detach(): void {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown, true)
    stacks.delete(document)
  }

  return {
    enter(layer) {
      const trigger = layer.trigger()
      layer.parent = [...layers]
        .reverse()
        .find((candidate) => trigger !== null && candidate.panel()?.contains(trigger))
      for (const candidate of [...layers].reverse()) {
        if (candidate !== layer.parent && !descendsFrom(layer, candidate)) candidate.close(false)
      }
      if (layers.length === 0) attach()
      layers.push(layer)
    },
    leave(layer) {
      for (const child of [...layers].reverse()) {
        if (descendsFrom(child, layer)) child.close(false)
      }
      layers = layers.filter((candidate) => candidate !== layer)
      layer.parent = undefined
      if (layers.length === 0) detach()
    },
  }
}

export function createFallbackLayer(options: Omit<Layer, 'parent'>) {
  const layer: Layer = { ...options }
  let stack: LayerStack | undefined
  return {
    enter() {
      const document = layer.panel()?.ownerDocument
      if (!document || stack) return
      stack = stacks.get(document) ?? createStack(document)
      // Closing the previous root can detach its stack. Register the active stack afterwards.
      stack.enter(layer)
      stacks.set(document, stack)
    },
    leave() {
      const active = stack
      stack = undefined
      active?.leave(layer)
    },
  }
}
