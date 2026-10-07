# 注解定义的统一发现与装配

`@Indicator` 只声明类的定义元数据，模块求值不修改全局目录。定义保存在类的私有 Symbol 属性中；读取发生在静态工厂初始化完成后，不使用 `addInitializer`、WeakMap 或 WeakSet。

扫描工具按 TypeScript 符号识别 core 生产源码中的导出注解类，校验名称和 kind，生成唯一的 `generated/builtinIndicators.ts`。system 与 indicator 共用清单和加载时机，kind 只决定业务分类。清单动态加载并读取每个具体类导出，确保生产 tree-shaking 能追踪真实依赖。

`loadBuiltinIndicators()` 是内置定义唯一装配入口；并发调用共享加载 Promise，失败后可重试。注册以类上缓存的元数据对象为幂等身份，不再维护独立 loaded 状态或初始化查询 API。读取目录统一调用 `getRegisteredIndicatorDefinitions()`。

`createChartController()` 在创建 Chart 前等待装配完成。直接使用底层 Chart 或 StateKernel 的宿主也必须先完成装配；状态内核不执行模块注册。底层测试 setup 遵守同一前置条件。

外部扩展保留 `@Indicator` 语法，在初始化时显式调用 `registerIndicatorDefinition(Definition)`，无需 PluginHost 安装周期。相同定义重复装配无操作；不同定义争用同一名称或别名直接报错，校验全部别名后才写入目录。删除旧的隐式自动注册和覆盖语义，不提供兼容层。

`resolveIndicatorLayerId(definitionId, paneId, part)` 根据定义的 renderer、scale 或 title 名称规则生成 Layer ID。工厂与挂载描述均消费此规则。删除 `mainPane.rendererName`，主图业务描述不再另存名称；固定主图定义使用独占名称，可切换 pane 的定义使用 pane 级身份，特殊规则只在 `getRendererName` 声明。独立 overlay 直接声明 Layer ID，PluginHost 继续管理能力包，不参与指标定义生命周期。

未被生产消费的 `layerRegistry`、类型常量、导出与测试全部删除。渲染模型仍为 Scene / Layer，数据与计算链不改变。

验收包含目录冲突原子性、声明无注册副作用、并发装配幂等、全部定义的工厂身份一致性、开发扫描增删，以及 src/dist 的生产打包保留检查。
