# 指标规范 ID

指标目录、选择器和已保存布局使用统一的定义身份。`resolveIndicatorDefinitionId(input)` 在目录中解析内部名、展示名或别名，并返回规范 ID。目录查找支持大小写变体。

| 定义来源 | 规范 ID | 展示字段 |
| --- | --- | --- |
| 原生定义 | `displayName` | `displayName`，可附带 `title` 和 `info` |
| 内置脚本 | 定义的内部 `name` | 脚本名和可选的 `title`、`info` |
| 用户脚本 | 宿主分配的稳定内部 `name` | 可编辑的脚本名、`title` 和 `info` |

`createPlotIndicatorDefinition` 将脚本的 `id` 映射为 Core 内部 `name`，未提供 `id` 时用脚本名。`registerIndicators` 用内部名登记定义，建立展示名和别名索引。替换定义时先校验新别名的归属，再清除旧定义独有的索引键。因此用户脚本改名后，现有实例仍通过原有 ID 关联同一脚本。

图表运行时使用定义的内部 `name` 定位计算器。`calculationKey` 还包含计算输入和上下文，用于去重和结果存储。每次添加产生独立的 `instanceId`，供窗格、对象树和渲染投影寻址。
