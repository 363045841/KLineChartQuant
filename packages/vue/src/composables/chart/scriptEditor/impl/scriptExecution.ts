/** 调试执行与添加到图表：一次性的草稿外发，不持有会话状态。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { ScriptEditorDocument, ScriptSourceStore } from '../types.js'
import type { EditorDraft } from './scriptDrafts.js'

/** 一次调试运行所需的宿主、草稿与输出键回写入口。 */
export interface RunDraftRequest {
  readonly chart: ChartController | null
  readonly store: ScriptSourceStore | undefined
  /** 会话身份；调试输出按“会话:标签”归属，不占用定义 id。 */
  readonly sessionId: string
  readonly draft: EditorDraft
  onOutputId(outputId: string): void
}

/** 直接运行草稿：不保存、不注册定义，输出按标签身份订阅。 */
export async function runDraft(request: RunDraftRequest): Promise<void> {
  const { chart, store, sessionId, draft, onOutputId } = request
  if (!chart) throw new Error('当前图表尚未就绪')
  if (!store?.run || !store.output) throw new Error('此环境没有脚本运行服务')
  const run = store.run.bind(store)
  const outputId = `${sessionId}:${draft.id}`
  onOutputId(outputId)
  await chart.withIndicatorData((bars, market) =>
    run({ outputId, source: draft.source, trusted: draft.trusted, bars, market }),
  )
}

/**
 * 保存草稿并确保指标已启用。
 *
 * @param persist 会话的保存事务，成功后返回已提交文档
 * @param onDocument 已启用文档回写，用于后续输出订阅
 */
export async function addDraftToChart(
  chart: ChartController | null,
  draft: EditorDraft,
  persist: (draft: EditorDraft) => Promise<ScriptEditorDocument>,
  onDocument: (document: ScriptEditorDocument) => void,
): Promise<void> {
  if (!chart) throw new Error('当前图表尚未就绪')
  const document = await persist(draft)
  if (!chart.indicators.peek().some((item) => item.definitionId === document.id)) {
    if (chart.addIndicator(document.id) === null) throw new Error('添加指标到图表失败')
  }
  onDocument(document)
}
