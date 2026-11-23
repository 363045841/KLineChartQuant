/** 桌面应用启动：界面与脚本服务都由产品工作台负责装配，入口接入主进程宿主后挂载根组件。 */

import { __setAgentTransportFactory } from '@363045841yyt/klinechart/agent'
import { createApp } from 'vue'

import App from './App.vue'
import { connectDesktopAgentTransport } from './agent/desktop-agent-transport'
import { readAgentBridge } from './agent/read-agent-bridge'

// 桌面端的 Agent 宿主在主进程，页面只能经 preload 桥接入；缺桥说明 preload 没装上，
// 直接失败而不是退回到页面内的 SharedWorker。
const bridge = readAgentBridge()
if (!bridge) throw new Error('The desktop Agent bridge is missing from preload.')
__setAgentTransportFactory(() => connectDesktopAgentTransport(bridge))

createApp(App).mount('#app')
