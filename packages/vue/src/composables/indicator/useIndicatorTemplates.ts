/**
 * 指标模板的界面状态：订阅 Core 模板列表，封装保存、改名、删除与应用。
 *
 * @remarks
 * 与 useLayouts 同构：模板内容与列表都是 Core 的唯一事实来源，这里只持有
 * 面板开合、搜索词、忙碌态与错误文案等界面状态，不复制模板数据。
 */

import type {
  ChartController,
  IndicatorTemplateIndicator,
  IndicatorTemplateSummary,
} from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { useControllerSignal } from '../chart/useControllerSignal.js'

/** 弹层的两个页签；与 TradingView 的「指标 / 模板」对应。 */
export const INDICATOR_TEMPLATE_TABS = {
  indicators: 'indicators',
  templates: 'templates',
} as const

export type IndicatorTemplateTab =
  (typeof INDICATOR_TEMPLATE_TABS)[keyof typeof INDICATOR_TEMPLATE_TABS]

/** 保存成功后提示的展示时长。 */
const SAVE_SUCCESS_DURATION_MS = 1200

/** 「最近用过」分组最多展示几条。 */
const RECENT_VISIBLE_LIMIT = 5

/** 应用模板后的提示文案；成功不提示，被跳过的指标必须点名，不能静默少恢复。 */
export function describeApplyMessage(applied: number, skipped: ReadonlyArray<string>): string {
  if (skipped.length === 0) return ''
  return `已恢复 ${applied} 个指标，${skipped.length} 个无法加载：${skipped.join('、')}`
}

/** 创建模板弹层的响应式状态与操作。 */
export function useIndicatorTemplates(controller: Ref<ChartController | null>) {
  const templates = useControllerSignal(
    controller,
    (api) => api.templates,
    () => [] as ReadonlyArray<IndicatorTemplateSummary>,
  )
  const recentIds = useControllerSignal(
    controller,
    (api) => api.recentTemplateIds,
    () => [] as ReadonlyArray<string>,
  )
  const currentIndicators = useControllerSignal(
    controller,
    (api) => api.currentIndicators,
    () => [] as ReadonlyArray<IndicatorTemplateIndicator>,
  )

  const tab = ref<IndicatorTemplateTab>(INDICATOR_TEMPLATE_TABS.indicators)
  const searchQuery = ref('')
  const busy = ref(false)
  const error = ref('')
  const message = ref('')
  const saving = ref(false)
  const saved = ref(false)
  let savedTimer: ReturnType<typeof setTimeout> | undefined
  let messageTimer: ReturnType<typeof setTimeout> | undefined

  /** 按搜索词过滤后的模板列表；空搜索返回全部。 */
  const visibleTemplates = computed(() => {
    const keyword = searchQuery.value.trim().toLowerCase()
    if (!keyword) return templates.value
    return templates.value.filter(
      (template) =>
        template.name.toLowerCase().includes(keyword) ||
        template.labels.some((label) => label.toLowerCase().includes(keyword)),
    )
  })

  /** 「最近用过」分组只保留仍存在的模板，并按最近顺序排列。 */
  const recentTemplates = computed(() => {
    const byId = new Map(templates.value.map((template) => [template.id, template] as const))
    const recent: IndicatorTemplateSummary[] = []
    for (const id of recentIds.value) {
      const template = byId.get(id)
      if (template) recent.push(template)
      if (recent.length >= RECENT_VISIBLE_LIMIT) break
    }
    return recent
  })

  /** 统一的异步执行：失败写错误文案，成功后清空。 */
  async function run(operation: (api: ChartController) => Promise<unknown>): Promise<boolean> {
    const api = controller.value
    if (busy.value || !api) return false
    busy.value = true
    error.value = ''
    try {
      await operation(api)
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '模板操作失败'
      return false
    } finally {
      busy.value = false
    }
  }

  /** 打开面板时读取真实归档，不使用占位列表。 */
  async function refresh(): Promise<void> {
    await run((api) => api.listTemplates())
  }

  /** 保存当前指标组合；indicatorIds 为本次保留的指标定义，省略表示全部。 */
  async function save(name: string, indicatorIds?: ReadonlyArray<string>): Promise<boolean> {
    const done = await run((api) => api.saveTemplate({ name, indicatorIds }))
    if (!done) return false
    clearTimeout(savedTimer)
    saved.value = true
    savedTimer = setTimeout(() => {
      saved.value = false
      savedTimer = undefined
    }, SAVE_SUCCESS_DURATION_MS)
    return true
  }

  /** 应用模板并展示结果；跳过项在提示里点名。 */
  async function apply(id: string): Promise<boolean> {
    clearTimeout(messageTimer)
    message.value = ''
    let applied = 0
    let skipped: ReadonlyArray<string> = []
    const done = await run(async (api) => {
      const result = await api.applyTemplate({ id })
      applied = result.applied
      skipped = result.skipped
    })
    if (!done) return false
    const notice = describeApplyMessage(applied, skipped)
    if (!notice) return true
    message.value = notice
    messageTimer = setTimeout(() => {
      message.value = ''
      messageTimer = undefined
    }, SAVE_SUCCESS_DURATION_MS * 3)
    return true
  }

  /** 删除模板；core 立即提交，失败时模板留在列表里。 */
  function remove(id: string): Promise<boolean> {
    return run((api) => api.deleteTemplate({ id }))
  }

  /** 改名；与其它模板重名会被 core 拒绝，错误文案回填到界面。 */
  function rename(id: string, name: string): Promise<boolean> {
    return run((api) => api.renameTemplate({ id, name }))
  }

  /** 打开保存对话框。 */
  function openSave(): void {
    saving.value = true
    error.value = ''
  }

  /** 关闭保存对话框并清理提示。 */
  function closeSave(): void {
    saving.value = false
  }

  /** 切换页签同时清空提示，避免提示跨页签残留。 */
  function setTab(next: IndicatorTemplateTab): void {
    tab.value = next
    error.value = ''
    message.value = ''
  }

  return {
    tab,
    searchQuery,
    busy,
    error,
    message,
    saving,
    saved,
    templates,
    currentIndicators,
    visibleTemplates,
    recentTemplates,
    refresh,
    save,
    apply,
    remove,
    rename,
    openSave,
    closeSave,
    setTab,
  }
}
