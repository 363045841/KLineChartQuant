// 代码解释器公开入口：执行逻辑与工具定义分开导出。
// 宿主按需调用 createCodeInterpreterTool 装配，不再有导入副作用。
export * from './contract.js'
export * from './providers/runtime-provider.js'
export * from './service.js'
export * from './tool.js'
export {
  applyArtifactPolicy,
  inputFileBytes,
  MAX_STREAM_BYTES,
  selectChannel,
  truncateStream,
} from './transport/channel.js'
