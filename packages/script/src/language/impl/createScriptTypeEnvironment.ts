/** 创建唯一的脚本类型环境，统一文件装载、标准库和 TypeScript 编译选项。 */
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import ts from 'typescript'
import { scriptEditorTypeEntry, scriptEditorTypeFiles } from '../../editor/resources.js'
import { scriptStandardLibraryFiles } from '../standardLibraries.js'
import { SCRIPT_MODULE_KIND, SCRIPT_TARGET } from './scriptCompilerOptions.js'
import { SCRIPT_PARAMETERS_FILE, SCRIPT_SOURCE_FILE } from './scriptFiles.js'

/** 每个会话拥有独立的虚拟文件系统，只加载 ES2022，不加载 DOM 或宿主类型。 */
export function createScriptTypeEnvironment() {
  const files = new Map(Object.entries({ ...scriptEditorTypeFiles, ...scriptStandardLibraryFiles }))
  files.set(SCRIPT_SOURCE_FILE, '\n')
  files.set(SCRIPT_PARAMETERS_FILE, 'interface ScriptParameters {}')
  return createVirtualTypeScriptEnvironment(
    createSystem(files),
    [SCRIPT_SOURCE_FILE, SCRIPT_PARAMETERS_FILE, scriptEditorTypeEntry],
    ts,
    {
      target: SCRIPT_TARGET,
      module: SCRIPT_MODULE_KIND,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
  )
}
