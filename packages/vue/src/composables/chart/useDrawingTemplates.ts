// 绘图模板的唯一响应式状态源：同一仓库、同一图元类型共享同一份状态。

import type {
  DrawingKind,
  DrawingTemplate,
  DrawingTemplateStore,
} from '@363045841yyt/klinechart-core/engine/drawing'
import { createDrawingTemplateStore } from '@363045841yyt/klinechart-core/engine/drawing'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { useToast } from '../toast/useToast.js'

const defaultStore = createDrawingTemplateStore()
const LOAD_FAILED = '加载模板失败'
const SAVE_FAILED = '模板保存失败'
const REMOVE_FAILED = '模板删除失败'

type TemplateState = {
  readonly templates: Ref<DrawingTemplate[]>
  readonly busy: Ref<boolean>
  readonly error: Ref<string>
  readonly savedName: Ref<string | null>
}

const states = new WeakMap<DrawingTemplateStore, Map<DrawingKind, TemplateState>>()

function getState(store: DrawingTemplateStore, kind: DrawingKind): TemplateState {
  let byKind = states.get(store)
  if (!byKind) {
    byKind = new Map()
    states.set(store, byKind)
  }
  let state = byKind.get(kind)
  if (!state) {
    state = {
      templates: ref([]),
      busy: ref(false),
      error: ref(''),
      savedName: ref(null),
    }
    byKind.set(kind, state)
  }
  return state
}

export function useDrawingTemplates(
  kind: Readonly<Ref<DrawingKind | undefined>>,
  store: DrawingTemplateStore = defaultStore,
) {
  const current = () => {
    const value = kind.value
    return value ? { kind: value, state: getState(store, value) } : null
  }
  const state = computed(() => current()?.state)
  const templates = computed(() => state.value?.templates.value ?? [])
  const busy = computed(() => state.value?.busy.value ?? false)
  const error = computed(() => state.value?.error.value ?? '')
  const savedName = computed(() => state.value?.savedName.value ?? null)
  const names = computed(() => templates.value.map((template) => template.name))
  const toast = useToast()

  async function reload(): Promise<void> {
    const active = current()
    if (!active) return
    const { state: target } = active
    target.error.value = ''
    target.savedName.value = null
    try {
      target.templates.value = await store.list(active.kind)
    } catch {
      target.error.value = LOAD_FAILED
    }
  }

  async function mutate(
    run: (kind: DrawingKind) => Promise<DrawingTemplate[]>,
    failure: string,
  ): Promise<DrawingTemplate[] | null> {
    const active = current()
    if (!active || active.state.busy.value) return null
    const target = active.state
    target.busy.value = true
    target.error.value = ''
    try {
      const next = await run(active.kind)
      target.templates.value = next
      return next
    } catch {
      target.error.value = failure
      return null
    } finally {
      target.busy.value = false
    }
  }

  async function save(template: DrawingTemplate | null, feedback = false): Promise<boolean> {
    if (!template) return false
    const active = current()
    if (!active) return false
    const next = await mutate((target) => store.upsert(target, template), SAVE_FAILED)
    if (!next) return false
    const saved = next.some((item) => item.name === template.name)
    if (saved && feedback) active.state.savedName.value = template.name
    return saved
  }

  /** 删除后给出「撤销」：恢复到删除时的图元类型，不受之后选区切换影响。 */
  async function remove(name: string): Promise<boolean> {
    const active = current()
    const removed = active?.state.templates.value.find((template) => template.name === name)
    const removedOk = (await mutate((target) => store.remove(target, name), REMOVE_FAILED)) !== null
    if (removedOk && active && removed) {
      const { kind: removedKind, state: removedState } = active
      toast.showUndo({
        message: `已删除模板「${name}」`,
        onUndo: async () => {
          try {
            removedState.templates.value = await store.upsert(removedKind, removed)
          } catch {
            removedState.error.value = SAVE_FAILED
          }
        },
      })
    }
    return removedOk
  }

  return {
    templates,
    names,
    busy,
    error,
    savedName,
    clearError() {
      const active = current()
      if (active) active.state.error.value = ''
    },
    reload,
    save,
    remove,
  }
}
