# 设备环境的单一事实来源

设备环境由 Core foundation/device 管理，每个浏览器 Window 共享一份只读 signal 快照，包含 deviceType、isCoarsePointer 与 resolved。Vue 通过现有 signalBridge 直接读取，不再复制检测逻辑或业务状态。config 公开统一的读取入口，原 getDeviceType 也从同一快照取值。

设备类型优先使用 Client Hints 的异步 formFactors，再用 UA 与输入能力做同步估计。resolved 表示 formFactors 是否已经结算：false 时 deviceType 只是临时同步估计，true 时才是权威值。可拆卸设备同时报告 Desktop 与 Tablet 时保持桌面类型；iPadOS 桌面 UA 通过 Macintosh + maxTouchPoints 识别；Chrome 在 Android 平板上默认使用桌面 UA，UA 已不含 Android/Tablet 标记，因此同步兜底还要求多点触控、粗指针且不是 Windows。粗指针能力来自 pointer: coarse，仅用于交互策略。

formFactors 查询在窗口环境首次创建时发起一次，不阻塞首帧；查询被拒绝、结果缺少 formFactors 或浏览器不支持时都以同步估计结算，避免消费者永久等待。查询属于窗口环境创建流程，不放在 useCodeMirror 内部；图表场景下在页面打开时发起，独立编辑器场景下由 resolved 门控等待结算，避免平板先启动 Worker 再销毁。

Script 编辑器仅在 resolved 为 true 且设备为桌面时加载语言服务模块、启动 Worker。手机和平板保留 CodeMirror 基本编辑与 TypeScript 语法高亮，不提供语义诊断、补全、悬停、参数提示或依赖同一 Worker 的格式化。语言服务与编辑器视图独立启停，环境变化不会重建文档。格式化按钮仅在语言服务就绪且文档可编辑时启用。

内置 tooltip 与外部插槽统一读取粗指针能力，并在能力变化时更新显隐。触屏电脑的交互策略不影响其桌面设备类型和语言服务策略。
