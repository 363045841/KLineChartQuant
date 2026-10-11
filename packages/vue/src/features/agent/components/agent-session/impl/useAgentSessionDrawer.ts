/** 会话抽屉的互斥编辑状态、草稿和面板焦点管理。 */
import { computed, nextTick, ref, watch } from 'vue'
import type { AgentSessionView } from '../../../agent-contracts.js'
import { type AgentLocale, getAgentCopy } from '../../../agent-copy.js'
import type { AgentSessionInteraction } from '../types.js'

/** 保留抽屉关闭期间的编辑状态，面板挂载后才恢复焦点。 */
export function useAgentSessionDrawer(props: { show: boolean; locale: AgentLocale }) {
  const text = computed(() => getAgentCopy(props.locale))
  const panel = ref<HTMLElement | null>(null)
  const interaction = ref<AgentSessionInteraction>(null)
  const renameDraft = ref('')

  /** 仅在面板仍打开且未进入另一行编辑时恢复面板焦点。 */
  function focusPanel(): void {
    void nextTick(() => {
      if (props.show && interaction.value === null) panel.value?.focus()
    })
  }

  watch(
    () => props.show,
    (open) => {
      if (open) focusPanel()
    },
  )

  /** 设置唯一重命名目标并预填标题。 */
  function openRename(session: AgentSessionView): void {
    renameDraft.value = session.title
    interaction.value = { sessionId: session.id, mode: 'rename' }
  }

  /** 设置唯一删除确认目标，焦点由会话行负责。 */
  function openDelete(session: AgentSessionView): void {
    interaction.value = { sessionId: session.id, mode: 'delete' }
  }

  /** 退出当前编辑，清理草稿并恢复面板焦点。 */
  function closeInteraction(): void {
    if (interaction.value === null) return
    interaction.value = null
    renameDraft.value = ''
    focusPanel()
  }

  return { text, panel, interaction, renameDraft, openRename, openDelete, closeInteraction }
}
