<!-- 指标目录的实时性，以及脚本发布失败的处理边界。 -->

# 指标目录实时性与脚本发布隔离

两个问题被同一个现象暴露：webUI 的指标列表只剩 SVP / PVP。

## 一、目录不能缓存为 computed

`allIndicators()` 曾把注册表映射缓存进一个 `computed`。内置脚本在运行时陆续注册，而 `computed` 只有在**有订阅者**时才会被失效驱动；选择器读取目录时没有建立订阅，于是读到的永远是第一次计算的结果——启动那一刻只有原生指标，所以列表里只剩 SVP / PVP。

注册表本身已经是廉价的内存遍历（几十条记录），没有缓存的必要。改为每次调用都读 `getIndicatorDescriptors()` 的当前值，目录永远与注册表一致。`findIndicator()` 同时改为在单次快照上查询，避免同一函数体内多次取到不同快照。

选择器侧的刷新也从「读一次」改为「订阅注册表变更」：`onIndicatorDefinitionChanged` 每触发一次就重建目录，脚本服务晚到也能进入列表。

## 二、脚本身份放进静态目录

「指标」和「用户自定义脚本」两个分组的划分依据是脚本身份（内置只读 / 用户可编辑），原来靠 `getRegisteredIndicatorDefinition(id)?.document?.identity` 判断——这要求实现**已经加载**。

未加载的内置脚本于是两边都不满足：既不算原生指标（`source === 'script'`），也拿不到 builtin 身份，直接从两个分组里消失。

现在 `IndicatorDescriptor` 增加 `documentIdentity`，由注册时写入，`Indicator` / `IndicatorDefinition` 逐层透传，选择器直接读这个字段，不再依赖实现是否加载。

## 三、单个脚本失败不再拖垮整批

`restoreScriptWorkspace` 原本顺序发布内置脚本，任一条 `prepare` 抛错就中断整批并重新抛出，结果是断点之后的全部脚本（含 RSI、KDJ 等）都不存在。

改为逐条 `try/catch`：失败时用脚本声明的名字（解析不出时退回序号）打印 `[ScriptService] 内置脚本发布失败：<名称>` 与原始异常，然后继续发布剩余脚本。用户脚本的恢复同样逐条隔离。

这是**可观测性**而非掩盖：错误仍然完整打印，只是不再让一个坏脚本决定整个指标列表的存亡。设计上认为「部分指标可用」优于「全部不可用」。

## 验证

- 类型检查通过；`packages/core` 247 文件 2847 用例、`packages/vue` 62 文件 274 用例通过；`packages/script-chart` 18 用例通过。
- 浏览器实测：列表从 2 项变为 64 项，包含 RSI / KDJ / MA / VWAP / SMA / PVT；这些此前返回 `null` 的指标现在都能成功添加。
