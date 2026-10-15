# 脚本编辑器语言服务

指标脚本弹窗保留 CodeMirror，使用 TypeScript 语言服务提供 JavaScript 的补全、类型悬浮说明、参数签名和诊断。编辑器不执行草稿，不从 QuickJS 对象枚举补全候选。

## 类型来源

- `packages/script/src/editor/globals.d.ts.txt` 描述实际注入的脚本全局 API，作为文本资源保存。
- 行情序列、技术分析库、指标元数据和绘图声明直接引用 Script / plot-contracts 的现有类型。
- Script build 从这些契约生成 `./editor` 导出的类型资源；Vue 通过包入口消费，不扫描其他包的源码目录。编辑器构建时将资源和当前 TypeScript 的 ECMAScript 标准库嵌入 Worker，不从 CDN 获取声明。
- 全局声明只加载进虚拟脚本程序，宿主编译器不会将文本资源作为声明文件加载，不需要 tsconfig 排除配置。
- TypeScript 根据调用解析出的声明签名识别 `defineIndicator`，再从 `inputs` 类型推导 `ScriptParameters`；支持函数别名、globalThis、对象变量和展开，不把局部同名函数误当作声明，也不维护参数补全列表。只能从静态类型已知的输入推导参数，运行时构造的未知属性不生成虚假的参数类型。

运行时的全局注入和静态类型声明承担不同职责。注入让脚本能执行，声明让语言服务知道对象及函数的类型。补全由语言服务从声明和用户代码推导，Vue 中没有另一份 API 名称或成员目录。

## 会话生命周期

打开编辑器后按需加载语言服务模块并创建独立 Worker。TypeScript 的解析和检查不占用主线程。CodeMirror 的现成适配 `@valtown/codemirror-ts` 负责文档同步、类型补全、悬浮说明与诊断；JavaScript 原有的语法片段补全继续保留。

现成适配的服务端补全有历史名称白名单，会过滤自定义脚本全局和部分 JS 关键字。因此补全服务端直接将 TypeScript 返回的完整候选转换成 CodeMirror 数据格式，不按名称筛选，也不维护候选目录；编辑器侧继续使用现成适配。

参数签名使用 TypeScript 的 `getSignatureHelpItems`，通过 CodeMirror tooltip 展示。文档同步先于签名请求；文档或光标变化后，过期签名响应被丢弃。

初始化期间可以继续编辑，服务挂载时采用当前文档。关闭弹窗或卸载组件时释放代理并终止 Worker，各会话不共享源码或推导参数。

语言服务加载失败会在弹窗中显示错误。保存仍通过原来的源码仓库和 QuickJS 校验路径完成，静态诊断不会替代运行时校验。

## 构建与范围

Worker 使用 Vite 的 inline Worker 产物，普通 ESM / CJS 包通过动态模块按需加载；单文件 web-component 构建内嵌资源，但仍在打开编辑器时才创建 Worker。发布后的调用方不需要访问 workspace 源码或配置标准库下载地址。

第一阶段编辑的仍是 JavaScript，不引入 TypeScript 转译。标准库不包含 DOM 或 Node API，因此不会把浏览器的 `open` / `close` 与行情序列混淆。

已提供类型的库是内置 `ta`。宿主额外加载的库尚未接入编辑器的声明传递接口；运行时加载库本身不能产生静态成员类型。

现成适配已停止主动新增功能，本次使用其现有公开接口，并用真实语言服务测试验证内置脚本、局部成员、参数变化、空文档、签名和诊断。弹窗交互和各终端的 Worker 加载由用户手动验证。
