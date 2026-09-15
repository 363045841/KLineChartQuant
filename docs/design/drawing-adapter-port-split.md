# 绘图适配器按职责拆成三个 port

`DrawingChartAdapter` 不再是单一大接口，而是由三个职责 port 组合而成的契约。协作者只依赖各自用到的最小 port，组合类型仅用于 `ChartController` 边界。

## 问题

原 `DrawingChartAdapter` 有 30 个方法，混装图元 CRUD、批量操作、选择集合、工具状态、视口/坐标换算、数据读取、会话态通知。任何协作者（`HitTester`、`magnetSnapper`、`selectionMarquee`、`DrawingState`、`DragHandler`、`coordinateUtils`）都只能声明整个接口，测试替身被迫实现全部 30 个方法，漂移成本高——这正是 #178 类型错误的一个来源。

## Port 划分

| Port | 方法数 | 职责 |
| --- | --- | --- |
| `DrawingDocumentPort` | 15 | 图元增删改查、批量操作、选择集合、工具状态 |
| `DrawingViewportPort` | 14 | 视口与数据读取、逻辑索引/时间戳/像素/价格换算 |
| `DrawingSessionPort` | 1 | `requestDraw()`：会话态变更后请求重绘，不写 kernel |

`DrawingChartAdapter = DrawingDocumentPort & DrawingViewportPort & DrawingSessionPort`，仅由 `ChartController extends` 与 `DrawingInteractionController` 使用。

## 协作者依赖收窄

| 协作者 | 依赖 |
| --- | --- |
| `DrawingInteractionController` | `DrawingChartAdapter`（组合，确实需要全部） |
| `DrawingState` | `DrawingDocumentPort & DrawingSessionPort` |
| `HitTester` | `DrawingViewportPort` |
| `coordinateUtils` | `DrawingViewportPort` |
| `magnetSnapper` | `DrawingViewportPort` |
| `selectionMarquee` | `DrawingViewportPort` |
| `DragHandler` | `DrawingViewportPort` |

## 边界

- 运行时零变化：port 只是 `controllers/types.ts` 里的类型拆分，`createChartController` 返回的对象同时满足三个 port。
- `ChartController` 对外形态不变，vue / angular / react 适配层不受影响；三个 port 额外从 `controllers/index.ts` 导出，供需要窄依赖的消费方与测试替身使用。
- `DrawingChartAdapter` 名称保留为组合别名，避免跨包 import 断裂。
