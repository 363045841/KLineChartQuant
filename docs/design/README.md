# 设计文档

本目录按语义模块分组，每篇描述一个模块的**当前形态与契约**（而非实现计划）。
跨领域约定与全框架边界仍以 `docs/` 根目录文档为准（如 `docs/rendering-pipeline.md`）。

| 目录 | 范围 |
|------|------|
| [`agent/`](agent/) | Agent 工具、图表上下文与行情查询边界 |
| [`comparison/`](comparison/) | 对比视图与对比写原语 |
| [`data/`](data/) | 行情序列仓库、数据身份与资产类别筛选 |
| [`drawing/`](drawing/) | 绘图领域模型、命令、交互、渲染与会话 |
| [`indicator/`](indicator/) | 指标实例、计算/渲染绑定与查询层 |
| [`rendering/`](rendering/) | Scene/Layer、渲染后端、帧几何、轴标签与图元可见性 |
| [`viewport/`](viewport/) | 槽位网格、未来区、滚动调度与惯性 |
| [`timeshare/`](timeshare/) | 分时 / 五日分时的存储、几何与指标 |
| [`axis/`](axis/) | 价格轴展示、范围来源与滚轮交互 |
| [`legend/`](legend/) | 主图图例与副图悬浮工具条 |
| [`session/`](session/) | 市场会话与最新价倒计时 |
| [`theme/`](theme/) | 主题预设与颜色 Token |
| [`state/`](state/) | StateKernel 状态模块（pane、workspace） |
| [`conventions/`](conventions/) | 模块布局、设置解析、控制器标识与测试夹具 |
| [`history/`](history/) | 已移除遗留层的记录 |

## 约定

- 文档描述模块边界、契约与不变量；不写"谁去做、怎么做"的实施计划。
- 源码模块级 README（`packages/*/src/**/README.md`）承载贴近实现的细节；本目录承载跨文件的设计决策。
- 新增文档放入对应语义目录；仅当出现新的语义领域时才新建目录。
