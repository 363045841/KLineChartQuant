/** 会话行事件适配：把共享可编辑行的提交与确认转成会话域事件，并在动作后退出编辑。 */
import { computed } from 'vue'
import { type AgentLocale, getAgentCopy } from '../../../agent-copy/index.js'

/**
 * 会话行的文案与会话域事件转发。
 * @param props 界面语言。
 * @param events 会话的重命名、删除与取消回调。
 */
export function useAgentSessionRow(
  props: { locale: AgentLocale },
  events: { rename(title: string): void; delete(): void; cancel(): void },
) {
  const text = computed(() => getAgentCopy(props.locale))

  /** 提交重命名；共享行已校验非空，这里直接转发并退出编辑。 */
  function submitRename(title: string): void {
    events.rename(title)
    events.cancel()
  }

  /** 确认删除后退出确认区域。 */
  function confirmDelete(): void {
    events.delete()
    events.cancel()
  }

  return { text, submitRename, confirmDelete }
}
