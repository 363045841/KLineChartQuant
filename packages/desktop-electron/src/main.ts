/** 桌面应用启动：开启脚本自动注册后挂载图表界面。 */
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
// 引入脚本定义模块，其 defineIndicator 会被自动注册。
import '@363045841yyt/klinechart-script/indicators'
import { createApp } from 'vue'

import App from './App.vue'

registerDefinedScripts()
createApp(App).mount('#app')
