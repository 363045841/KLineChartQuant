// 本文件管理回复复制到剪贴板的状态，并在短暂反馈后自动复位。
import { onScopeDispose, ref } from 'vue'

/** 复制成功/失败反馈在界面上的保留时长（ms）。 */
const COPY_FEEDBACK_DURATION_MS = 2000

/** 复制原始正文，保留 Markdown 格式并报告复制结果。 */
export function useMessageCopy(content: () => string) {
  const status = ref<'idle' | 'copied' | 'failed'>('idle')
  let resetTimer: ReturnType<typeof setTimeout> | undefined

  // 反馈状态只短暂展示，到点复位回 idle。
  function scheduleReset(): void {
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      resetTimer = undefined
      status.value = 'idle'
    }, COPY_FEEDBACK_DURATION_MS)
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content())
      status.value = 'copied'
    } catch {
      status.value = 'failed'
    }
    scheduleReset()
  }

  onScopeDispose(() => {
    if (resetTimer) clearTimeout(resetTimer)
  })

  return { status, copy }
}
