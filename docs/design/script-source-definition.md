# 完整脚本作为指标定义来源

## 背景

早期实现让 TS 脚本声明一张 `IndicatorDef`，用 `onBar.toString()` 反推源码，再单独维护一份
源码 Map。结果是源码、定义、执行端口分三处写入：编辑器读不到、更新被当成重复注册、
失败时还会留下“定义已变、源码未变”的中间状态。

## 决策

**一份完整的 JS 文件就是指标定义的唯一来源。** 文件通过 `defineIndicator` 声明元数据与
`onBar`，QuickJS 初始化文件一次，宿主读取校验后的元数据，随后逐 bar 调用 VM 内的 `onBar`。

### 单一提交

`IndicatorSourceDocument`（`revision`、`source`、`definition`）随运行定义一起交给 Core 的 `registerIndicators`。目录一次提交源码快照和运行定义。

### 生命周期

`script-chart` 的 `createScriptService()` 在启动时恢复 IndexedDB 用户脚本并注册内置源码。
`read` / `list` 同步读取注册表，`create` / `update` / `remove` 异步等待持久化事务后提交运行定义。
内置脚本只读，用户通过创建副本获得可编辑的独立身份，详见 [身份与持久化](script-identity-persistence.md)。

| 动作 | 语义 |
| --- | --- |
| `create` | 校验并编译整份文件，写入定义目录；同名拒绝重复 |
| `read` / `list` | 从已提交定义读取，不重新执行用户脚本 |
| `update` | 要求打开时的 `revision`，过期草稿不覆盖；内部定义 ID 保持稳定 |
| `remove` | 删除定义身份，并移除依赖它的实例与计算缓存 |

目录修订后，计算中枢取消变更定义的旧任务并清除对应结果，再装配新计算器。其它定义的任务和结果继续复用。详见[行情计算与脚本警报](calculation-hub-and-alerts.md)。

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
