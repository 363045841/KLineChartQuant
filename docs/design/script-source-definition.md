# 完整脚本作为指标定义来源

## 背景

早期实现让 TS 脚本声明一张 `IndicatorDef`，用 `onBar.toString()` 反推源码，再单独维护一份
源码 Map。结果是源码、定义、执行端口分三处写入：编辑器读不到、更新被当成重复注册、
失败时还会留下“定义已变、源码未变”的中间状态。

## 决策

**一份完整的 JS 文件就是指标定义的唯一来源。** 文件通过 `defineIndicator` 声明元数据与
`onBar`，QuickJS 初始化文件一次，宿主读取校验后的元数据，随后逐 bar 调用 VM 内的 `onBar`。

### 单一提交

`IndicatorSourceDocument`（`revision` + `source` + `definition`）挂在 core 定义快照上，
通过 `registerPlotIndicator` / `updatePlotIndicator` 一次提交。不再有独立的源码注册表，
也不存在“定义已更新、源码未写入”的窗口。

### 生命周期

`script-chart` 的 `createScriptService()` 在启动时恢复 IndexedDB 用户脚本并注册内置源码。
`read` / `list` 同步读取注册表，`create` / `update` / `remove` 异步等待持久化事务后提交运行定义。
内置脚本只读，用户通过创建副本获得可编辑的独立身份，详见 [身份与持久化](script-identity-persistence.md)。

| 动作 | 语义 |
| --- | --- |
| `create` | 校验并编译整份文件，写入定义目录；同名拒绝重复 |
| `read` / `list` | 从已提交定义读取，不重新执行用户脚本 |
| `update` | 要求打开时的 `revision`，过期草稿不覆盖；`name` 是固定身份 |
| `remove` | 删除定义身份，并移除依赖它的实例与计算缓存 |

定义变更事件显式区分 `create` / `update` / `remove`。执行器分别用新增、更新、删除接口，
更新与删除清理对应计算器和结果缓存，其它定义缓存保留。Worker 使用同一套消息语义。
单个消费者失败不会回滚已提交快照，也不会阻断其它消费者。

### 计算身份

`runtime.revision` 来自定义版本，进入实例计算上下文 `definitionRevision`。
源码更新后，即使行情和参数不变，计算键也会变化并触发重算。

### 库

库是加载进同一个 VM 的源码，统一走 `defineLibrary(name, members)` / `importLibrary(name)`。
内置 `ta` 是显式 manifest 里的普通库，用户库复用同一协议，`createScriptService` 可注入额外库源码。

### 执行安全

每个 Context 设置时间、内存与栈上限，失控脚本抛错而不是挂住主线程。

## 约束

修改输入默认值或默认 pane 会影响目录及后续创建的实例；已有实例保留用户参数与位置。
本次提交只更新定义，不自动迁移已创建的实例。
