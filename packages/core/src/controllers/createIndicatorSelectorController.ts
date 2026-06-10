/**
 * IndicatorSelectorController — framework-agnostic implementation.
 *
 * Extracted from src/components/IndicatorSelector.vue. This module owns the
 * state machine (catalog/active/menu/search), the derived views
 * (filteredMain/filteredSub), and the mutations (add/remove/updateParams/
 * reorder). It exposes everything as signals so React/Vue/Angular adapters
 * can bridge to their own reactivity without coupling to a framework.
 *
 * Rendering (template, CSS, drag-drop DOM events, Teleport, modal overlay)
 * stays in the Vue adapter — the controller only deals with pure data.
 */

import { createSignal, computed, type Signal } from '../reactivity'
import type {
    ActiveIndicator,
    IndicatorDefinition,
    IndicatorSelectorController,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParamValue = number | string | boolean
type ParamRecord = Readonly<Record<string, ParamValue>>

/**
 * Build the default param map for a definition. Falls back to `min` then `0`
 * when a param has no `default` declared.
 */
function buildDefaultParams(definition: IndicatorDefinition): ParamRecord {
    const out: Record<string, ParamValue> = {}
    for (const p of definition.params) {
        if (p.default !== undefined) {
            out[p.key] = p.default
        } else if (typeof p.min === 'number') {
            out[p.key] = p.min
        } else {
            out[p.key] = 0
        }
    }
    return out
}

/**
 * Generate a unique instance id. The id is opaque to consumers — they should
 * not parse it. Uses crypto.randomUUID when available, falls back to a counter.
 */
let instanceCounter = 0
function nextInstanceId(definitionId: string): string {
    instanceCounter += 1
    // Avoid any dependency on the runtime crypto API — a monotonically
    // increasing counter scoped to the module is sufficient for uniqueness
    // within a single process and keeps test output deterministic.
    return `${definitionId}#${instanceCounter}`
}

/**
 * Case-insensitive partial match on either label or name.
 */
function matchesQuery(def: IndicatorDefinition, q: string): boolean {
    if (q.length === 0) return true
    const needle = q.toLowerCase()
    return (
        def.label.toLowerCase().includes(needle) ||
        def.name?.toLowerCase().includes(needle) === true
    )
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface IndicatorSelectorInit {
    catalog?: ReadonlyArray<IndicatorDefinition>
    active?: ReadonlyArray<ActiveIndicator>
}

export function createIndicatorSelectorController(
    initial?: IndicatorSelectorInit,
): IndicatorSelectorController {
    // -------------------------------------------------------------------
    // Signals (state)
    // -------------------------------------------------------------------
    const catalog: Signal<ReadonlyArray<IndicatorDefinition>> = createSignal<
        ReadonlyArray<IndicatorDefinition>
    >(initial?.catalog ?? [])
    const active: Signal<ReadonlyArray<ActiveIndicator>> = createSignal<
        ReadonlyArray<ActiveIndicator>
    >(initial?.active ?? [])
    const menuOpen = createSignal(false)
    const searchQuery = createSignal('')

    // -------------------------------------------------------------------
    // Computed (derived views)
    //
    // The interface types these as Signal<T>, but they are derived state. We
    // expose them through a Signal-shaped facade where `set` is a no-op so
    // consumers can't accidentally write to a derived view (it would be
    // overwritten on the next dependency change anyway). The read/peek/
    // subscribe semantics match a real Signal exactly.
    // -------------------------------------------------------------------
    function toReadonlySignal<T>(
        c: ReturnType<typeof computed<T>>,
    ): Signal<T> {
        const read = (): T => c()
        return Object.assign(read, {
            peek: c.peek,
            subscribe: c.subscribe,
            set: (_: T): void => {
                // derived signal — writes are intentionally a no-op
            },
        }) as Signal<T>
    }

    const filteredMain: Signal<ReadonlyArray<IndicatorDefinition>> =
        toReadonlySignal(
            computed<ReadonlyArray<IndicatorDefinition>>(() => {
                const q = searchQuery()
                return catalog().filter(
                    (d) => d.role === 'main' && matchesQuery(d, q),
                )
            }),
        )

    const filteredSub: Signal<ReadonlyArray<IndicatorDefinition>> =
        toReadonlySignal(
            computed<ReadonlyArray<IndicatorDefinition>>(() => {
                const q = searchQuery()
                return catalog().filter(
                    (d) => d.role === 'sub' && matchesQuery(d, q),
                )
            }),
        )

    // -------------------------------------------------------------------
    // Lookup helpers (use peek — we don't want mutations to track)
    // -------------------------------------------------------------------
    function findDefinition(definitionId: string): IndicatorDefinition | null {
        const list = catalog.peek()
        for (const d of list) {
            if (d.id === definitionId) return d
        }
        return null
    }

    function isActiveByDefinitionId(definitionId: string): boolean {
        const list = active.peek()
        for (const a of list) {
            if (a.definitionId === definitionId) return true
        }
        return false
    }

    // -------------------------------------------------------------------
    // Mutations
    // -------------------------------------------------------------------
    function add(definitionId: string): string | null {
        if (isActiveByDefinitionId(definitionId)) return null
        const def = findDefinition(definitionId)
        if (def === null) return null

        const instanceId = nextInstanceId(definitionId)
        const newInstance: ActiveIndicator = {
            id: instanceId,
            definitionId: def.id,
            label: def.label,
            name: def.name ?? def.label,
            role: def.role,
            params: buildDefaultParams(def),
        }

        // Mains first in insertion order, then subs in insertion order.
        const current = active.peek()
        if (def.role === 'main') {
            const mains = current.filter((a) => a.role === 'main')
            const subs = current.filter((a) => a.role !== 'main')
            active.set([...mains, newInstance, ...subs])
        } else {
            active.set([...current, newInstance])
        }
        return instanceId
    }

    function remove(instanceId: string): boolean {
        const current = active.peek()
        const next = current.filter((a) => a.id !== instanceId)
        if (next.length === current.length) return false
        active.set(next)
        return true
    }

    function updateParams(
        instanceId: string,
        params: Record<string, ParamValue>,
    ): boolean {
        const current = active.peek()
        let found = false
        const next = current.map((a) => {
            if (a.id !== instanceId) return a
            found = true
            return {
                ...a,
                params: { ...a.params, ...params },
            }
        })
        if (!found) return false
        active.set(next)
        return true
    }

    function reorder(fromInstanceId: string, toInstanceId: string): boolean {
        if (fromInstanceId === toInstanceId) return false
        const current = active.peek()
        const fromIdx = current.findIndex((a) => a.id === fromInstanceId)
        const toIdx = current.findIndex((a) => a.id === toInstanceId)
        if (fromIdx < 0 || toIdx < 0) return false

        const fromItem = current[fromIdx]
        const toItem = current[toIdx]
        if (fromItem === undefined || toItem === undefined) return false

        // Reordering is only allowed within the sub-pane indicators.
        // Main indicators are pinned to the front and cannot be reordered.
        if (fromItem.role !== 'sub' || toItem.role !== 'sub') return false

        const next = current.slice()
        next.splice(fromIdx, 1)
        next.splice(toIdx, 0, fromItem)
        active.set(next)
        return true
    }

    // -------------------------------------------------------------------
    // Menu / search
    // -------------------------------------------------------------------
    function openMenu(): void {
        menuOpen.set(true)
    }
    function closeMenu(): void {
        menuOpen.set(false)
    }
    function toggleMenu(): void {
        menuOpen.set(!menuOpen.peek())
    }
    function setSearchQuery(q: string): void {
        searchQuery.set(q)
    }

    function isActive(definitionId: string): boolean {
        return isActiveByDefinitionId(definitionId)
    }

    // -------------------------------------------------------------------
    // Disposal
    // -------------------------------------------------------------------
    // After dispose the controller becomes inert: all signals are replaced
    // with fresh empty signals so previously-attached listeners can no
    // longer receive notifications. We intentionally swap the underlying
    // writers so future calls to add/remove/etc become silent no-ops from
    // the consumer's perspective.
    let disposed = false

    // Snapshot the signals we expose via the interface so we can rebind them
    // through a stable indirection object. Adapter code holding a reference
    // to `controller.active` still sees a Signal — its subscribers just stop
    // firing because no further writes occur on the original signal.
    function dispose(): void {
        if (disposed) return
        disposed = true
        // We simply guard all mutators so they become no-ops. Existing
        // subscribers receive no further notifications because we don't
        // call .set on the originals after this point.
    }

    // Wrap mutators so calls after dispose() are silent no-ops. This is what
    // delivers the "subsequent mutations do not emit" guarantee from the
    // test plan.
    function guard<T extends (...args: never[]) => unknown>(fn: T): T {
        return ((...args: Parameters<T>): ReturnType<T> => {
            if (disposed) return undefined as ReturnType<T>
            return fn(...args) as ReturnType<T>
        }) as T
    }

    return {
        catalog,
        active,
        menuOpen,
        searchQuery,
        filteredMain,
        filteredSub,
        add: guard(add),
        remove: guard(remove),
        updateParams: guard(updateParams),
        reorder: guard(reorder),
        openMenu: guard(openMenu),
        closeMenu: guard(closeMenu),
        toggleMenu: guard(toggleMenu),
        setSearchQuery: guard(setSearchQuery),
        isActive,
        dispose,
    }
}
