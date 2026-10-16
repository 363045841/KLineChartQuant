/** 分轮更新受转换影响的推导类型，避免为已变成 number 的别名重复插入 [0]。 */
import type ts from 'typescript'
import type { ScriptConversion, ScriptInsertion, ScriptValueRead } from '../types.js'
import { convertSeriesExpressions } from './convertSeriesExpressions.js'

/** 复用调用方的增量程序，转换到不再出现隐式数值读取，并组合各轮位置映射。 */
export function convertScriptSource(
  source: string,
  analyze: (code: string) => { file: ts.SourceFile; checker: ts.TypeChecker },
): ScriptConversion {
  const stages: ScriptConversion[] = []
  const insertions: ScriptInsertion[] = []
  let valueReads: ScriptValueRead[] = []
  let code = source
  /** 先前虚拟文档的位置逐层还原为原文位置。 */
  function toSource(position: number): number {
    for (let index = stages.length - 1; index >= 0; index--) {
      const stage = stages[index]
      if (stage) position = stage.toSource(position)
    }
    return position
  }
  while (true) {
    const { file, checker } = analyze(code)
    const stage = convertSeriesExpressions(file, checker)
    if (!stage.insertions.length) break
    valueReads = valueReads.map((read) => ({
      ...read,
      generatedPosition: stage.toGenerated(read.generatedPosition),
    }))
    for (const read of stage.valueReads) {
      valueReads.push({
        sourceStart: toSource(read.sourceStart),
        sourceEnd: toSource(read.sourceEnd),
        generatedPosition: read.generatedPosition,
      })
    }
    for (const insertion of stage.insertions) {
      insertions.push({ ...insertion, position: toSource(insertion.position) })
    }
    stages.push(stage)
    code = stage.code
  }
  return {
    code,
    insertions,
    valueReads,
    /** 依次应用各轮插入文本的偏移。 */
    toGenerated(position) {
      for (const stage of stages) position = stage.toGenerated(position)
      return position
    },
    toSource,
  }
}
