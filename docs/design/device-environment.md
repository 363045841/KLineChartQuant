# 设备环境的单一事实来源

设备环境由 Core foundation/device 管理，每个浏览器 Window 共享一份只读 signal 快照，包含 deviceType 与 isCoarsePointer。Vue 通过现有 signalBridge 直接读取，不再复制检测逻辑或业务状态。config 公开统一的读取入口，原 getDeviceType 也从同一快照取值。

设备类型通过 Client Hints 的 mobile 标记与 UA 判断，包含 Android 平板及使用桌面 UA 的 iPadOS；不再将屏幕宽度或粗指针直接视为移动设备。粗指针能力来自 pointer: coarse，仅用于交互策略。订阅期间监听媒体查询和窗口尺寸变化，最后一个订阅者离开时移除监听；SSR 不初始化或缓存浏览器环境。

Script 编辑器仅在桌面设备加载语言服务模块、启动 Worker。手机和平板保留 CodeMirror 基本编辑与 TypeScript 语法高亮，不提供语义诊断、补全、悬停、参数提示或依赖同一 Worker 的格式化。语言服务与编辑器视图独立启停，环境变化不会重建文档。格式化按钮仅在语言服务就绪且文档可编辑时启用。

内置 tooltip 与外部插槽统一读取粗指针能力，并在能力变化时更新显隐。触屏电脑的交互策略不影响其桌面设备类型和语言服务策略。
