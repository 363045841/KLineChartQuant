// 宿主侧 Agent 入口：只在 SharedWorker 中加载，页面不得引用本入口。
export { type BrowserAgentHostOptions, startBrowserAgentHost } from './browser/impl/start-host.js'
