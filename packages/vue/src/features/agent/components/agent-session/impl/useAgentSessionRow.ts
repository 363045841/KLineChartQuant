/** 会话行的输入校验、交互事件和受控焦点管理。 */
import { computed, nextTick, type Ref, useTemplateRef, watch } from 'vue'
import { type AgentLocale, getAgentCopy } from '../../../agent-copy.js'
import type { AgentSessionRowMode } from '../types.js'

/** 监听展示模式，DOM 更新后只聚焦仍有效的当前编辑区域。 */
export function useAgentSessionRow(
  props: { mode: AgentSessionRowMode; locale: AgentLocale },
  draft: Ref<string>,
  events: { rename(title: string): void; delete(): void; cancel(): void },
) {
  const text = computed(() => getAgentCopy(props.locale))
  const renameInput = useTemplateRef<HTMLInputElement>('renameInput')
  const deleteCancel = useTemplateRef<HTMLButtonElement>('deleteCancel')

  watch(
    () => props.mode,
    (mode) => {
      void nextTick(() => {
        if (props.mode !== mode) return
        if (mode === 'rename' && renameInput.value?.isConnected) {
          renameInput.value.focus()
          renameInput.value.select()
        }
        if (mode === 'delete' && deleteCancel.value?.isConnected) deleteCancel.value.focus()
      })
    },
    { immediate: true },
  )

  /** 提交去掉首尾空白的有效标题，再请求退出编辑。 */
  function submitRename(): void {
    const title = draft.value.trim()
    if (!title) return
    events.rename(title)
    events.cancel()
  }

  /** 发出删除请求后退出确认区域。 */
  function confirmDelete(): void {
    events.delete()
    events.cancel()
  }

  return { text, submitRename, confirmDelete }
}
