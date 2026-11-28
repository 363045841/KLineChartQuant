/** 脚本与图表的装配入口：完整源码文档的生命周期服务。 */
export { createScriptService } from './scripts/impl/createScriptService.js'
export { decodeScriptWorkspace } from './scripts/impl/scriptWorkspaceCodec.js'
export type {
  SavedScript,
  ScriptDocument,
  ScriptFolder,
  ScriptFolderRemoval,
  ScriptPersistence,
  ScriptService,
  ScriptServiceOptions,
  ScriptWorkspace,
} from './scripts/types.js'
