import { registerRootComponent } from 'expo'

import App from './App'

// 冷启动计时起点：原生 JS 开始执行的时刻。
globalThis.__KCQ_NATIVE_START__ = performance.now()

registerRootComponent(App)
