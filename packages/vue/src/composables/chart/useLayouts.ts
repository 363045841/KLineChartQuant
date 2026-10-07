// 将布局领域 API 接入 Vue；弹层只负责展示与派发操作。
import type { ChartController, LayoutSummary } from '@363045841yyt/klinechart-core/controllers'
import { computed, onScopeDispose, type Ref, ref } from 'vue'
import type { DropMenuGroup } from '../../components/DropMenu.vue'
import { useControllerSignal } from './useControllerSignal.js'

const SAVE_SUCCESS_DURATION_MS = 1000

/** 订阅 core 布局信号，并集中处理异步操作、命名和错误展示。 */
export function useLayouts(controller: Ref<ChartController | null>) {
  const layouts = useControllerSignal(
    controller,
    (api) => api.layouts,
    () => [],
  )
  const activeId = useControllerSignal(
    controller,
    (api) => api.activeLayoutId,
    () => 'default',
  )
  const currentName = computed(
    () => layouts.value.find(({ id }) => id === activeId.value)?.name ?? '默认布局',
  )
  const autoSave = useControllerSignal(
    controller,
    (api) => api.layoutAutoSave,
    () => true,
  )
  const dirty = useControllerSignal(
    controller,
    (api) => api.layoutDirty,
    () => false,
  )
  const saveError = useControllerSignal(
    controller,
    (api) => api.layoutSaveError,
    () => null,
  )
  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => [
    {
      id: 'actions',
      label: '',
      items: [
        { id: 'save', label: '保存布局' },
        { id: 'autosave', label: '自动保存', disabled: busy.value },
      ],
    },
    {
      id: 'create',
      label: '',
      items: [{ id: 'create', label: '创建新布局', disabled: busy.value }],
    },
    {
      id: 'layouts',
      label: '布局列表',
      items: layouts.value.map((layout) => ({
        id: layout.id,
        label: layout.name,
        active: layout.id === activeId.value,
        disabled: busy.value,
      })),
    },
  ])
  const busy = ref(false)
  const saved = ref(false)
  let savedTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(savedTimer))
  const error = ref('')
  const naming = ref<{
    mode: 'create' | 'rename' | 'duplicate'
    id?: string
    initialName: string
  } | null>(null)
  const namingError = ref('')
  const deleting = ref<string | null>(null)
  /** 弹窗标题随命名模式切换。 */
  const namingTitle = computed(() => {
    if (naming.value?.mode === 'rename') return '重命名布局'
    if (naming.value?.mode === 'duplicate') return '复制布局'
    return '创建新布局'
  })
  /** 确认按钮文案随命名模式切换。 */
  const namingConfirmLabel = computed(() => {
    if (naming.value?.mode === 'rename') return '保存'
    if (naming.value?.mode === 'duplicate') return '复制'
    return '创建'
  })

  /** 异步失败保留界面输入，允许用户重试。 */
  async function run(operation: (api: ChartController) => Promise<unknown>): Promise<boolean> {
    if (busy.value || !controller.value) return false
    busy.value = true
    error.value = ''
    try {
      await operation(controller.value)
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '布局操作失败'
      return false
    } finally {
      busy.value = false
    }
  }

  /** 打开时读取真实归档，不使用占位列表。 */
  async function refresh(): Promise<void> {
    await run((api) => api.listLayouts())
  }

  /** 选择文档成功后关闭弹层。 */
  async function select(id: string): Promise<void> {
    await run((api) => api.switchLayout({ id }))
  }

  /** 打开命名弹窗；复制预填副本名，重命名预填原名称，创建用占位名。 */
  function openNaming(mode: 'create' | 'rename' | 'duplicate', layout?: LayoutSummary): void {
    namingError.value = ''
    deleting.value = null
    naming.value = {
      mode,
      id: layout?.id,
      initialName:
        mode === 'duplicate'
          ? `${layout?.name ?? currentName.value} 副本`
          : mode === 'create'
            ? '未命名'
            : (layout?.name ?? currentName.value),
    }
  }

  /** 关闭命名弹窗并清除本次错误。 */
  function closeNaming(): void {
    naming.value = null
    namingError.value = ''
  }

  /** 提交命名操作；失败保留弹窗与输入，成功才关闭。 */
  async function submitNaming(name: string): Promise<void> {
    const input = naming.value
    if (!input || !name.trim() || busy.value || !controller.value) return
    const api = controller.value
    busy.value = true
    namingError.value = ''
    try {
      if (input.mode === 'rename' && input.id) await api.renameLayout({ id: input.id, name })
      else if (input.mode === 'duplicate' && input.id)
        await api.duplicateLayout({ id: input.id, name })
      else await api.createLayout({ name })
      closeNaming()
    } catch (failure) {
      namingError.value = failure instanceof Error ? failure.message : '布局操作失败'
    } finally {
      busy.value = false
    }
  }

  /** 覆盖当前归档，名称与身份不变。 */
  async function saveCurrent(): Promise<void> {
    if (busy.value) return
    clearTimeout(savedTimer)
    saved.value = false
    if (await run((api) => api.saveLayout({ id: activeId.value, name: currentName.value }))) {
      saved.value = true
      savedTimer = setTimeout(() => {
        saved.value = false
        savedTimer = undefined
      }, SAVE_SUCCESS_DURATION_MS)
    }
  }

  /** 删除前由 UI 明确选择目标，成功才移除确认行。 */
  async function remove(id: string): Promise<void> {
    if (await run((api) => api.deleteLayout({ id }))) deleting.value = null
  }

  /** 下拉操作：列表选择、保存、自动保存与创建在面板内派发，命名类操作打开弹窗。 */
  async function onSelect(group: string, id: string): Promise<void> {
    if (group === 'layouts') {
      await select(id)
      return
    }
    if (id === 'save') {
      await saveCurrent()
      return
    }
    if (id === 'autosave') {
      await run((api) => api.setLayoutAutoSave({ enabled: !autoSave.value }))
      return
    }
    if (id === 'create') openNaming('create')
  }

  return {
    layouts,
    activeId,
    currentName,
    groups,
    autoSave,
    dirty,
    message: computed(() => error.value || saveError.value || ''),
    onSelect,
    busy,
    saved,
    error,
    naming,
    namingTitle,
    namingConfirmLabel,
    namingError,
    deleting,
    refresh,
    select,
    openNaming,
    closeNaming,
    submitNaming,
    saveCurrent,
    remove,
  }
}
