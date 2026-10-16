/** 脚本语义程序的编译选项：类型分析与去类型转译必须使用同一语言级别。 */
import ts from 'typescript'

/** 脚本语言级别；虚拟机只执行该级别的输出。 */
export const SCRIPT_TARGET = ts.ScriptTarget.ES2022

/** 脚本按全局脚本编译，模块语法由编译入口单独拒绝。 */
export const SCRIPT_MODULE_KIND = ts.ModuleKind.ESNext
