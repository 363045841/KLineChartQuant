/** 桌面应用启动：注册宿主脚本后挂载图表界面。 */
import { registerScriptIndicator } from '@363045841yyt/klinechart-core'
import { openCloseAverage } from '@363045841yyt/klinechart-script/indicators'
import { createApp } from 'vue'

import App from './App.vue'

registerScriptIndicator(openCloseAverage, { pane: 'main' })
createApp(App).mount('#app')
