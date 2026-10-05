// 管理原地编辑草稿、焦点与异步提交；提交失败保留草稿供用户再次发送。
import { computed, nextTick, ref, watch } from 'vue'
import type { MessageEditOptions } from '../types.js'

/** 为单条用户消息创建编辑状态，只有服务端接受后才退出编辑。 */
export function useMessageEdit(options: MessageEditOptions) {
  const editing = ref(false)
  const draft = ref('')
  const pending = ref(false)
  const error = ref('')
  const input = ref<HTMLTextAreaElement | null>(null)
  const canEdit = computed(
    () => options.message().role === 'user' && Boolean(options.message().runId && options.action()),
  )
  const canSave = computed(
    () => canEdit.value && !options.disabled() && !pending.value && Boolean(draft.value.trim()),
  )

  /** 从已发送正文创建草稿，并在输入框挂载后聚焦。 */
  async function begin(): Promise<void> {
    if (!canEdit.value || options.disabled() || pending.value) return
    draft.value = options.message().content
    error.value = ''
    editing.value = true
    await nextTick()
    input.value?.focus()
  }

  /** 丢弃本地草稿，进行中的提交不能被取消按钮伪装为撤销。 */
  function cancel(): void {
    if (pending.value) return
    editing.value = false
    error.value = ''
  }

  /** 发送修改后的正文；空输入与并发点击不产生运行。 */
  async function save(): Promise<void> {
    const action = options.action()
    const runId = options.message().runId
    if (!canSave.value || !action || !runId) return
    pending.value = true
    error.value = ''
    try {
      await action(runId, draft.value.trim())
      editing.value = false
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : options.failureText()
    } finally {
      pending.value = false
    }
  }

  /** 支持 Escape 取消和 Ctrl/⌘ Enter 提交，输入法组合期间保留原生按键。 */
  function keydown(event: KeyboardEvent): void {
    if (event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void save()
    }
  }

  // 会话快照替换消息时，旧草稿不能绑定到新的运行。
  watch(() => options.message().id, cancel)
  return { editing, draft, pending, error, input, canEdit, canSave, begin, cancel, save, keydown }
}
