## 🚀 What's New

- **v0.11** 引入 AI Agent 运行时（agent-runtime 与 AI runtime，支持 OpenAI 协议与浏览器内对话，Web/Electron 共享 Agent 工作区）及 @tool 注册基础设施与绘图 Agent 工具。绘图工具支持子图与分时绘制、workspace 隔离、多选批量编辑、空白区域锚点、单行内联文本编辑、框选成组拖拽与标签位置配置；同时新增五日分时、分时指标原生支持与持久化视图工作区，并完成 WebGL 可见画布直绘等性能优化。
- **v0.10** 以统一 MarketDataProvider 重构数据层，新增多日分时、图表与 Agent 共享的统一指标查询管线、Fibonacci/矩形/箭头标注工具，并将对比模式升格为独立图表模式。Vue/React/Angular 绑定对齐统一 Provider 契约，同时修复多项渲染与状态一致性问题。
- **v0.9.0** 自研 Core 层响应式模型迁移，时序问题消除
- **v0.9.0** 单路径 Scene 渲染器 + WebGPU 后端（混合 DOM Canvas，无 compositeTo）、FrameTransaction 响应式、设备丢失恢复、自动降级 WebGPU → WebGL → Canvas2D
- **v0.8** 支持商品比较，支持多数据源聚合
- **v0.7** 渲染器注册链路AOP重构，支持装饰器语法，拆分monorepo，支持vue、react（实验性），core单独发包，令牌化颜色系统
- **v0.6.10** 统一 WebGL 渲染上下文共享，重构副图生命周期管理 — 通过 SubPaneManager 集中管理副图实例，paneId 作为一等标识
- **v0.6.6** 综合渲染优化：价格转坐标批量化、刻度位置与几何数据缓存、月份键值计算优化；**200Hz 屏幕下稳定 190-200fps**，单帧生成时间降至 **2ms**
- **v0.6.3** K 线、成交量柱、MACD 柱支持 WebGL 渲染，大幅提升整体性能
- **v0.6.1** 双层 Canvas 架构：Main + Overlay 分层渲染，引入 UpdateLevel 选择性更新，**200Hz 显示器下稳定 180fps 低抖动**
- **v0.6.0** 重构指标计算管线：MA/BOLL/EXPMA/ENE/RSI/CCI/STOCH/MOM/WMSR/KST/FASTK 统一采用 Calculator → Scheduler → StateStore → Renderer 无状态架构，提升性能与可维护性
- **v0.5.6** 对数价格轴支持，网格线在像素层面均匀分布
- **v0.5.2** 新增高级绘图工具：平行通道、回归趋势、平滑顶底、不相交通道
- **v0.5.0** 完整绘图工具系统，支持直线、矩形、文字绘制与样式编辑
- **v0.4** 现代化 UI，左侧工具栏、右轴优化、TradingView 式缩放手感
