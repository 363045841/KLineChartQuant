/** 新窗口即时持有编辑草稿，宿主消息只确认已处理的版本，避免输入依赖跨窗口往返。 */
import { shallowRef } from 'vue'
import type { DetachedEditorCommand, DetachedEditorSnapshot } from '../windowTypes.js'

/** 创建本地编辑状态及命令出口；迟到的确认不能覆盖更晚的输入。 */
export function createDetachedEditorState(
  initial: DetachedEditorSnapshot,
  send: (command: DetachedEditorCommand) => void,
) {
  const snapshot = shallowRef(initial)

  /** 命令始终携带最新草稿，保存和返回无需等待上一条编辑消息被确认。 */
  function command(type: DetachedEditorCommand['type']): void {
    const { source, trusted, editVersion } = snapshot.value
    send({ type, source, trusted, editVersion })
  }

  return {
    snapshot,
    command,
    /** 只接受已追上本地输入版本的宿主确认。 */
    apply(next: DetachedEditorSnapshot) {
      if (next.editVersion < snapshot.value.editVersion) {
        snapshot.value = { ...snapshot.value, logs: next.logs }
        return
      }
      snapshot.value = next
    },
    /** 本地立即更新文本和信任状态，再异步通知宿主。 */
    updateSource(source: string) {
      snapshot.value = {
        ...snapshot.value,
        source,
        trusted: false,
        saved: false,
        editVersion: snapshot.value.editVersion + 1,
      }
      command('draft')
    },
    /** 信任变更和文本共用版本序列，避免旧确认重新授予信任。 */
    updateTrusted(trusted: boolean) {
      snapshot.value = {
        ...snapshot.value,
        trusted,
        saved: false,
        editVersion: snapshot.value.editVersion + 1,
      }
      command('draft')
    },
  }
}
