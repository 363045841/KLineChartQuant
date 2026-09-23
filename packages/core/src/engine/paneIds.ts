/**
 * Pane ID 词汇表：集中管理 pane 标识符，避免业务代码散落字符串字面量。
 */

/**
 * 主图 pane 的唯一标识。
 * 与渲染器的 GLOBAL_PANE_ID（Symbol，表示渲染到所有 pane）语义不同，二者不会冲突。
 */
export const MAIN_PANE_ID = 'main' as const
