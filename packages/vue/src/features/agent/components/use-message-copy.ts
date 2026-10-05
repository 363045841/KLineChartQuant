// 本文件管理回复复制到剪贴板的状态。
import { ref } from 'vue'

/** 复制原始正文，保留 Markdown 格式并报告复制结果。 */
export function useMessageCopy(content: () => string) {
  const status = ref<'idle' | 'copied' | 'failed'>('idle')
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(content())
      status.value = 'copied'
    } catch {
      status.value = 'failed'
    }
  }
  return { status, copy }
}
