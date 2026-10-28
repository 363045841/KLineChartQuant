/**
 * 脚本编译期共用的 AST 约定：源码改写、onBar 归属判定与编译器注入的全局名。
 *
 * 输入编译与 Request 编译都基于同一份 TS 语法树，两条链路必须遵守同一套位置规则，
 * 因此规则只在这里维护一份，避免两处实现各自漂移。
 */
import ts from 'typescript'

/** 脚本唯一的逐 bar 入口名；输入与 Request 都只允许声明在它内部。 */
const ON_BAR_METHOD = 'onBar'

/** 脚本里的输入工厂对象名。 */
export const INPUT_FACTORY = 'input'

/** 输入编译产出的读取入口；Request 编译据此识别可以独立求值的声明。 */
export const INPUT_VALUE = '__inputValue'

/** 输入编译产出的注册入口，由 VM 运行时实现。 */
export const DECLARE_INPUT = '__declareInput'

/** Request 编译产出的注册入口，由 VM 运行时实现。 */
export const DECLARE_REQUEST = '__declareRequest'

/** Request 编译产出的读取入口，由 VM 运行时实现。 */
export const REQUEST_VALUE = '__requestValue'

/** 回调表达式登记表，由 VM 运行时实现。 */
export const REQUEST_EXPRESSIONS = '__requestExpressions'

/** 脚本里的跨周期请求入口。 */
export const SECURITY_CALL = 'request.security'

/** 单次源码改写：把 [from, to) 替换成 text。 */
export interface SourceEdit {
  readonly from: number
  readonly to: number
  readonly text: string
}

/**
 * 按区间倒序应用改写，前面的位置不受后续替换影响。
 * @param source 原始源码
 * @param edits 互不重叠的改写区间
 * @returns 改写后的源码
 */
export function applySourceEdits(source: string, edits: readonly SourceEdit[]): string {
  let result = source
  for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
    result = result.slice(0, edit.from) + edit.text + result.slice(edit.to)
  }
  return result
}

/**
 * 判断匿名回调是否就是 onBar，并返回它的声明节点。
 * 只接受方法简写和 `onBar = () => {}` 属性写法，其他声明方式一律视为不在 onBar 内。
 * @param file 用于读取声明名
 * @param callback 待判定的函数节点
 * @returns 是 onBar 时返回其声明节点，否则 undefined
 */
export function onBarDeclarationOf(
  file: ts.SourceFile,
  callback: ts.Node,
): ts.NamedDeclaration | undefined {
  const owner = ts.isMethodDeclaration(callback)
    ? callback
    : (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        ts.isPropertyAssignment(callback.parent)
      ? callback.parent
      : undefined
  return owner?.name?.getText(file) === ON_BAR_METHOD ? owner : undefined
}

/**
 * 判断声明是否位于某个函数内部；用于区分行情局部变量与文件级常量。
 * @param node 待判定的声明节点
 * @returns 位于函数内部时为 true
 */
export function isLocalDeclaration(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return true
  }
  return false
}
