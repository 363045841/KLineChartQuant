# develop 分支 Fallow 审查

审查基准：`origin/main`（1da6969d），分支原始 HEAD：c020a859。范围为 63 个变更文件，以及全部 7 个变更测试文件（含已删除的 drawingRange.test.ts）。使用仓库 `.agents/skills/fallow-review/SKILL.md`，结合 Fallow review、audit、dead-code trace、CodeGraph 调用链和测试验证。

## 需要在合并前处理的代码问题

### P1：窗口清单并发保存共用临时文件

位置：`packages/desktop-electron/electron/window-store.ts:58`、`packages/desktop-electron/electron/main.ts:84`。

每次开关窗口都触发未等待的 `saveWorkspaceIds`，所有写入共用 `window-workspaces.json.tmp`。多个调用会相互覆盖临时内容、争抢 rename，既可能保存过时清单，也会产生没有捕获的 Promise rejection。在独立临时目录并发调用真实保存函数 8 次，4 次返回 `ENOENT`，已复现。

应串行提交窗口清单，并处理写入失败；单纯给临时文件换随机名称不能保证提交顺序。

### P1：跨窗口标签接管存在丢失与重复窗口

位置：`packages/desktop-electron/src/shell/use-workspace-tabs.ts:136`。

接管先保存源工作区的删除，再更新目标内存并保存目标工作区。第二次写入失败或进程中断时，源端已经没有标签，目标端却没有持久化记录。源窗口尚未提交的延迟保存也未参与协调，可能在接管后把删除前的快照写回，导致标签重新出现。读取源工作区时同样可能读不到刚创建或刚更新的标签。

应把双方快照变更放进同一次 IndexedDB 事务，并协调源窗口待提交写入；验证目标提交失败时源标签仍可恢复，以及源端延迟写入不会复活已移交标签。

### P1：正常退出后无法恢复原有工作区

位置：`packages/desktop-electron/electron/windows.ts:75`、`packages/desktop-electron/electron/main.ts:69`。

窗口 closed 时从集合删除并保存剩余 ID。最后一个窗口关闭后保存 `[]`，下次启动生成新的 UUID，从而无法再定位原工作区的 IndexedDB 标签。退出应用关闭所有窗口时也会经过此路径，抵消了启动恢复清单的功能。

应明确区分关闭单个工作区和退出应用的会话保存，并验证关闭最后一个窗口、菜单退出和重新启动的往返行为。

### P2：普通文本拖放可触发标签栏异常

位置：`packages/desktop-electron/src/shell/TabBar.vue:325`。

标签栏接受 `text/plain`。`JSON.parse('null')` 成功后，代码直接访问 `payload.fromWorkspaceId` 会抛异常；类型断言不能验证 JSON 数据。还应在访问成员前确认载荷是非空对象，且两个身份字段都是非空字符串。

## 已完成的测试清理与直接修复

- `window-ipc.test.ts`：门禁矩阵加入遗漏的 adoptTab；拒绝来源时检查所有受保护动作都没有执行；合并最大化操作与状态查询场景，验证 false → true → false 完整往返；新建窗口改为共享表驱动。
- `accent-slot.test.ts`：删除重复验证连续占用的独立用例，合并为分配、释放、复用的生命周期场景。
- `workspace-tabs.test.ts`：合并重复排序结构，覆盖前后两种插入方向，同时验证原数组不变、标签对象保持身份。
- `window-shell.test.ts`：不检查调用次数的桥替身移除无价值 spy，并显式满足 WindowBridge 契约；加入零槽位和空参数验证。同步修复空字符串被 Number 转为 0 的问题。
- `layoutManager.test.ts`：启动恢复改为 true/false 参数化测试，保留手动切换验证；真实 300ms 等待替换为虚拟计时；新场景使用 finally 释放资源。
- `frameProjection.test.ts`：保留时间锚点与延长方向的一致性验证，补充滚动、隐藏、非法价格、非法索引、缺失时间与空视口范围验证。
- 删除的 `drawingRange.test.ts` 依赖已经移除的 Plot 范围职责，其滚动与图元范围行为由 frameProjection 的实际职责入口验证。
- 修复桌面包边界测试的真实失败：把仅由桌面端导入的 SVG 移入桌面包资源目录，保留原边界断言。
- 经 Fallow trace 确认，收回 resolveVisibleDrawing、WORKSPACE_TABS_DATABASE、isWorkspaceTab 三个无外部调用的导出，内部实现保留。

其余几何、轴标签、磁吸、布局持久化场景分别约束不同的可观察行为，保留。没有通过删除安全门禁、降低断言或增加 suppression 消除失败。

## 验证

- 桌面端：8 个测试文件，87 项通过。
- 核心全量：242 个测试文件通过，1 个跳过；2773 项通过，1 项跳过。
- `pnpm type-check:tests`、`pnpm type-check:src`：通过。
- `git diff --check`：通过。
- README 生成检查：通过。完整 `pnpm docs:check` 在未改动的 `docs/script/api.md` 发现生成物过期，未宣称完整文档检查通过。

Fallow 的复杂度风险使用静态估算的测试可达性，不等同于实际行覆盖率。审查不把“新增测试导入”当作覆盖完成；窗口拖放、接管与 Electron 启动路径仍需针对上述实际缺陷验证。Fallow 的 examples/scripts workspace 发现告警与 Expo tsconfig 解析限制也应随报告保留。

## Fallow 复核结论

图上可分为 5 组独立改动：布局控制器、绘图帧范围、Plot 投影、桌面与 Vue 工作台、Agent 初始展示。未要求为此拆分分支。

4 项公共契约判断均未发现额外的签名破坏：controllers/types 的 6 个分支外消费者，以及 createChartController、ChartRenderer、projectPlots 各 2 个分支外消费者已结合调用链、类型检查和相关测试复核。新增恢复开关为可选字段；Plot 保留 drawings 数据，只转移范围计算职责。静态图的判断不代替实际渲染和桌面交互验收。

最终 audit 仍为 fail：死代码报告从 4 项降为 1 项（剩余 getPaneCtxMap 为继承问题），重复代码组为 0，复杂度报告共 20 项，其中 9 项为分支新增的静态覆盖风险。没有为了让 audit 变绿而伪造覆盖率或增加 suppression。7 个低优先级单元仍在审查范围，可用 `fallow review --base origin/main --show-deprioritized` 展开。

未额外提出主观架构取舍问题；上文 4 项为有具体触发条件的代码缺陷，Fallow 回验只证明它们锚定于真实变更区域，不证明分析文字必然正确。
