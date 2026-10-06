// 将布局领域 API 接入 Vue；弹层只负责展示与派发操作。
import type { ChartController, LayoutSummary } from '@363045841yyt/klinechart-core/controllers'
import { computed, type ComponentPublicInstance, onScopeDispose, type Ref, ref } from 'vue'
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
  const name = ref('')
  const edit = ref<{ mode: 'create' | 'rename' | 'duplicate'; id?: string } | null>(null)
  const deleting = ref<string | null>(null)

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

  /** 命名表单只持有交互态，完整布局不进入 Vue。 */
  function begin(mode: 'create' | 'rename' | 'duplicate', layout?: LayoutSummary): void {
    edit.value = { mode, id: layout?.id }
    name.value =
      mode === 'duplicate'
        ? `${layout?.name ?? currentName.value} 副本`
        : mode === 'create'
          ? '未命名'
          : (layout?.name ?? currentName.value)
    deleting.value = null
  }

  /** 行内重命名输入框挂载时聚焦并选中名称，便于直接替换。 */
  function focusRenameInput(element: Element | ComponentPublicInstance | null): void {
    if (element instanceof HTMLInputElement && document.activeElement !== element) {
      element.focus()
      element.select()
    }
  }

  /** 提交对应领域方法，成功才清除编辑态。 */
  async function submit(): Promise<void> {
    const input = edit.value
    if (!input || !name.value.trim()) return
    const succeeded = await run((api) => {
      if (input.mode === 'rename' && input.id)
        return api.renameLayout({ id: input.id, name: name.value })
      if (input.mode === 'duplicate' && input.id)
        return api.duplicateLayout({ id: input.id, name: name.value })
      return api.createLayout({ name: name.value })
    })
    if (succeeded) edit.value = null
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

  /** 下拉操作在同一面板中展开，不创建居中弹窗。 */
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
    if (id === 'create') {
      begin('create')
      return
    }
    const current = layouts.value.find((layout) => layout.id === activeId.value)
    if (id === 'rename' || id === 'duplicate') begin(id, current)
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
    name,
    edit,
    deleting,
    refresh,
    select,
    begin,
    focusRenameInput,
    submit,
    saveCurrent,
    remove,
  }
}
