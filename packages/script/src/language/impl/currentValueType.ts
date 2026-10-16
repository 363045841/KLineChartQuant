/** 根据编译器记录的语义映射查询当前值类型，语言服务无需重新识别语法糖。 */
import ts from 'typescript'
import type { ScriptConversion } from '../types.js'

/** 定位包含生成位置的索引访问，即转换插入的当前值读取。 */
function findValueRead(
  file: ts.SourceFile,
  position: number,
): ts.ElementAccessExpression | undefined {
  /** 先下钻到包含位置的最深节点，再向上取最近的索引访问。 */
  function find(node: ts.Node): ts.ElementAccessExpression | undefined {
    if (position < node.getStart(file) || position >= node.end) return undefined
    const child = ts.forEachChild(node, find)
    if (child) return child
    return ts.isElementAccessExpression(node) ? node : undefined
  }
  return find(file)
}

/** 查询指定源码引用在此处读取的类型；未被物化的引用没有当前值映射。 */
export function currentValueType(
  program: ts.Program,
  path: string,
  sourceStart: number,
  sourceEnd: number,
  conversion: ScriptConversion,
): string | undefined {
  const read = conversion.valueReads.find(
    (entry) => entry.sourceStart === sourceStart && entry.sourceEnd === sourceEnd,
  )
  if (!read) return undefined
  const file = program.getSourceFile(path)
  if (!file) throw new Error(`语言程序缺少脚本文档：${path}`)
  const value = findValueRead(file, read.generatedPosition)
  if (!value) throw new Error('转换记录的取值位置与语言程序不一致')
  const checker = program.getTypeChecker()
  return checker.typeToString(checker.getTypeAtLocation(value))
}
