/** 签名提示的状态与交互；查询依赖语言会话，代码展示依赖统一只读视图。 */
import { type Extension, StateEffect, StateField } from '@codemirror/state'
import {
  type EditorView,
  showTooltip,
  type Tooltip,
  type TooltipView,
  ViewPlugin,
} from '@codemirror/view'
import {
  SCRIPT_EDITOR_FILE,
  type ScriptSignatureHelp,
  type ScriptSignatureProvider,
} from '../types.js'
import { createScriptCodeView } from './createScriptCodeView.js'

/** 签名数据与锚点组成一个原子快照。 */
interface SignatureTooltip extends Tooltip {
  signature: ScriptSignatureHelp
}

const signatureEffect = StateEffect.define<SignatureTooltip | null>()
const signatureField = StateField.define<SignatureTooltip | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.isUserEvent('select.pointer')) value = null
    // 查询期间保留提示，并将锚点映射到新文档，避免每次输入都先销毁 DOM。
    if (value && transaction.docChanged) {
      value = { ...value, pos: transaction.changes.mapPos(value.pos) }
    }
    for (const effect of transaction.effects) {
      if (effect.is(signatureEffect)) value = effect.value
    }
    return value
  },
  provide: (field) => showTooltip.from(field),
})

/** 固定 create 引用复用 tooltip；配色、参数强调与资源释放由代码视图统一处理。 */
function createSignatureTooltip(view: EditorView): TooltipView {
  const dom = view.dom.ownerDocument.createElement('div')
  dom.className = 'cm-script-tooltip cm-script-signature'
  const code = createScriptCodeView(dom, '')
  /** 将当前状态投影到稳定的代码视图。 */
  function updateText(): void {
    const signature = view.state.field(signatureField)?.signature
    code.update(signature?.text ?? '', signature?.activeParameter)
  }
  updateText()
  return { dom, update: updateText, destroy: () => code.destroy() }
}

/** 文档同步后查询签名，忽略过期结果并将有效查询失败交还语言会话。 */
export function scriptSignatureHelp(
  worker: ScriptSignatureProvider,
  onFailure: (error: Error) => void,
): Extension {
  const queries = ViewPlugin.define((view) => {
    let revision = 0
    let disposed = false
    /** 使用发起查询时的版本校验响应，包含排队中的微任务。 */
    async function updateSignature(request: number): Promise<void> {
      const state = view.state
      const position = state.selection.main.head
      try {
        const signature = await worker.getSignatureHelp(SCRIPT_EDITOR_FILE, position)
        if (
          disposed ||
          revision !== request ||
          view.state.doc !== state.doc ||
          view.state.selection.main.head !== position
        )
          return
        view.dispatch({
          effects: signatureEffect.of(
            signature
              ? { pos: position, above: true, signature, create: createSignatureTooltip }
              : null,
          ),
        })
      } catch (error) {
        if (!disposed && revision === request) {
          onFailure(error instanceof Error ? error : new Error(String(error)))
        }
      }
    }
    return {
      update(update) {
        if (!update.docChanged && !update.selectionSet) return
        const request = ++revision
        // 点击只负责定位光标，同时使尚未返回或尚未发起的查询失效。
        if (update.transactions.some((transaction) => transaction.isUserEvent('select.pointer')))
          return
        // 键盘移动仅更新已打开的提示，普通光标定位不主动查询。
        if (!update.docChanged && !update.state.field(signatureField)) return
        // ViewPlugin 先于文档同步监听器执行，微任务保证 Worker 先收到新文档。
        queueMicrotask(() => {
          if (!disposed && revision === request) void updateSignature(request)
        })
      },
      destroy() {
        disposed = true
      },
    }
  })
  return [signatureField, queries]
}
