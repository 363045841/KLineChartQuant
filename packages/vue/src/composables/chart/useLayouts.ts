// 将布局领域 API 接入 Vue；弹层只负责展示与派发操作。
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { computed, onScopeDispose, type Ref, ref } from 'vue'
import type { DropMenuGroup } from '../../components/DropMenu.vue'
import { useToast } from '../toast/useToast.js'
import { useControllerSignal } from './useControllerSignal.js'

const SAVE_SUCCESS_DURATION_MS = 1000
const DEFAULT_LAYOUT_NAME = '默认布局'

/** 布局菜单的分组与动作 id：groups 生产端与 LayoutMenu 消费端共用同一份定义。 */
export const LAYOUT_MENU = {
  group: { actions: 'actions', create: 'create', layouts: 'layouts' },
  item: { save: 'save', autosave: 'autosave', create: 'create' },
} as const

/** 命名弹窗模式；重命名与复制携带目标布局身份。 */
type NamingState =
  | { mode: 'create'; initialName: string }
  | { mode: 'rename' | 'duplicate'; id: string; initialName: string }

type NamingMode = NamingState['mode']

/** 命名弹窗的标题与确认按钮文案，按模式集中定义。 */
const NAMING_MODES: Record<NamingMode, { title: string; confirmLabel: string }> = {
  create: { title: '创建新布局', confirmLabel: '创建' },
  rename: { title: '重命名布局', confirmLabel: '保存' },
  duplicate: { title: '复制布局', confirmLabel: '复制' },
}

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
    () => '',
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

  /** 操作进行中；所有面板操作在此状态内串行派发。 */
  const busy = ref(false)
  const saved = ref(false)
  /** 本次操作的错误文案；与 core 的持久化错误合并展示。 */
  const error = ref('')
  /** 已删除、等待撤销窗口结束才真正提交的布局 id。 */
  const pendingDeletes = ref<ReadonlySet<string>>(new Set())
  const toast = useToast()
  const naming = ref<NamingState | null>(null)
  const namingError = ref('')
  let savedTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(savedTimer))

  const currentName = computed(
    () => layouts.value.find(({ id }) => id === activeId.value)?.name ?? DEFAULT_LAYOUT_NAME,
  )
  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => [
    {
      id: LAYOUT_MENU.group.actions,
      label: '',
      items: [
        { id: LAYOUT_MENU.item.save, label: '保存布局' },
        { id: LAYOUT_MENU.item.autosave, label: '自动保存', disabled: busy.value },
      ],
    },
    {
      id: LAYOUT_MENU.group.create,
      label: '',
      items: [{ id: LAYOUT_MENU.item.create, label: '创建新布局', disabled: busy.value }],
    },
    {
      id: LAYOUT_MENU.group.layouts,
      label: '布局列表',
      items: layouts.value
        .filter((layout) => !pendingDeletes.value.has(layout.id))
        .map((layout) => ({
          id: layout.id,
          label: layout.name,
          active: layout.id === activeId.value,
          deletable: layout.deletable,
          disabled: busy.value,
        })),
    },
  ])
  const namingTitle = computed(() => NAMING_MODES[currentNamingMode()].title)
  const namingConfirmLabel = computed(() => NAMING_MODES[currentNamingMode()].confirmLabel)

  /** 弹窗未打开时按创建模式取值，仅用于占位文案。 */
  function currentNamingMode(): NamingMode {
    return naming.value?.mode ?? 'create'
  }

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

  /** 选择文档；切换成功后由 core 更新活动身份。 */
  async function select(id: string): Promise<void> {
    await run((api) => api.switchLayout({ id }))
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

  /** 打开创建弹窗。 */
  function openCreate(): void {
    namingError.value = ''
    naming.value = { mode: 'create', initialName: '未命名' }
  }

  /** 打开重命名或复制弹窗，目标布局由调用方给出。 */
  function openNaming(mode: 'rename' | 'duplicate', target: { id: string; name: string }): void {
    namingError.value = ''
    naming.value = {
      mode,
      id: target.id,
      initialName: mode === 'duplicate' ? `${target.name} 副本` : target.name,
    }
  }

  /** 关闭命名弹窗并清除本次错误。 */
  function closeNaming(): void {
    naming.value = null
    namingError.value = ''
  }

  /** 提交命名操作；失败保留弹窗与输入，成功才关闭。 */
  async function submitNaming(name: string): Promise<void> {
    const target = naming.value
    if (!target || !name.trim() || busy.value || !controller.value) return
    const api = controller.value
    busy.value = true
    namingError.value = ''
    try {
      if (target.mode === 'create') await api.createLayout({ name })
      else if (target.mode === 'rename') await api.renameLayout({ id: target.id, name })
      else await api.duplicateLayout({ id: target.id, name })
      closeNaming()
    } catch (failure) {
      namingError.value = failure instanceof Error ? failure.message : '布局操作失败'
    } finally {
      busy.value = false
    }
  }

  function setPending(id: string, pending: boolean): void {
    const next = new Set(pendingDeletes.value)
    if (pending) next.add(id)
    else next.delete(id)
    pendingDeletes.value = next
  }

  /**
   * 删除布局：先从列表隐藏并给出「撤销」，撤销窗口结束后才提交到 core。
   * core 的 deleteLayout 不可逆，延迟提交让撤销不依赖恢复接口；提交失败时布局重新出现并显示错误。
   */
  function remove(id: string): void {
    const name = layouts.value.find((layout) => layout.id === id)?.name ?? ''
    setPending(id, true)
    toast.showUndo({
      id: `layout-delete-${id}`,
      message: name ? `已删除布局「${name}」` : '已删除布局',
      onUndo: () => setPending(id, false),
      onCommit: async () => {
        await run((api) => api.deleteLayout({ id }))
        setPending(id, false)
      },
    })
  }

  /** 下拉操作：列表选择、保存、自动保存与创建在面板内派发。 */
  async function onSelect(group: string, id: string): Promise<void> {
    if (group === LAYOUT_MENU.group.layouts) {
      await select(id)
      return
    }
    if (id === LAYOUT_MENU.item.save) {
      await saveCurrent()
      return
    }
    if (id === LAYOUT_MENU.item.autosave) {
      await run((api) => api.setLayoutAutoSave({ enabled: !autoSave.value }))
      return
    }
    if (id === LAYOUT_MENU.item.create) openCreate()
  }

  return {
    currentName,
    groups,
    autoSave,
    dirty,
    message: computed(() => error.value || saveError.value || ''),
    onSelect,
    busy,
    saved,
    naming,
    namingTitle,
    namingConfirmLabel,
    namingError,
    refresh,
    openCreate,
    openNaming,
    closeNaming,
    submitNaming,
    remove,
  }
}
