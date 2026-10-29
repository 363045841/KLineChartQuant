/** 新建及副本草稿：唯一名称与模板文本；身份改写需要语法树，交给可选的语言服务包。 */
import type { ScriptSourceStore } from '../types.js'

/** 为新建脚本或官方副本生成不与现有文档冲突的名称。 */
export function uniqueScriptName(
  store: Pick<ScriptSourceStore, 'read'> | undefined,
  base: string,
  reserved: readonly string[] = [],
): string {
  let name = base
  let suffix = 2
  while (store?.read(name) || reserved.includes(name)) name = `${base} ${suffix++}`
  return name
}

/**
 * 复制脚本并改写其身份名称。
 *
 * 语法树改写依赖 TypeScript 编译器，由 klinechart-script-server（AGPL，按需加载）承担，
 * 图表包因此不自带编译器。
 *
 * @param source 完整脚本源码
 * @param name 新名称
 * @returns 改写后的源码
 */
export async function createCopySource(source: string, name: string): Promise<string> {
  const { rewriteScriptIdentity } = await import('@363045841yyt/klinechart-script-server')
  return rewriteScriptIdentity(source, name)
}

/** 新建脚本提供可直接保存的独立声明。 */
export function createBlankSource(name: string): string {
  return `// 用户自定义指标\ndefineIndicator({\n  name: ${JSON.stringify(name)},\n  position: Position.Sub,\n  onBar() {\n    const period = input.int(20, { title: '周期', min: 1 })\n    plot.Line(ta.sma(close, period), 'ma')\n  },\n})\n`
}

/** 库模板仅公开可复用函数，不生成指标或绘图入口。 */
export function createLibrarySource(name: string): string {
  return `// 用户自定义库\ndefineLibrary(${JSON.stringify(name)}, {\n  /** 平滑价格序列。 */\n  smooth(source: Series, length: number): Series {\n    return ta.sma(source, length)\n  },\n})\n`
}
