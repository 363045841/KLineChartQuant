/**
 * SharedWorker 入口：整个 origin 只有一个实例，Agent 宿主在此长期驻留。
 *
 * 不提供页面内降级路径；宿主不可用时由页面显式报错。
 */

import { startBrowserAgentHost } from '@363045841yyt/klinechart-agent-runtime/browser-host'

startBrowserAgentHost()
