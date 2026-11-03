/** 桌面应用启动：界面与脚本服务都由产品工作台负责装配，入口只挂载根组件。 */

import { createApp } from 'vue'

import App from './App.vue'

createApp(App).mount('#app')
