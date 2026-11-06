# Shift 锁角（angle lock）

按住 Shift 时，落点绕参考点锁定到最近的 45° 方向。

## 方向约束，不是吸附

磁吸是值吸附：候选自带领域原值，命中后覆盖价格，有档位、半径与排除集合。
锁角只约束「参考点 → 落点」的向量方向，长度不变；没有候选、没有领域原值、也没有会话状态。

因此它不进 `magnet/`：实现是纯函数 `lockAngle(origin, point)`
（`geometry/impl/angleLock.ts`），档位与阈值放在 `geometry/types.ts`。

档位覆盖整个圆周：0°、45°、90°、135°、180°、225°、270°、315°。
`atan2` 落在 (-π, π]，四舍五入到 π/4 的整数倍即可覆盖全部方向。

## 坐标空间

全程 Pane 局部逻辑像素，与落点、命中、手柄、帧投影同一空间；像素等比，45° 即视觉 45°。

写回仍走 `screenToAnchor`：时间轴按 Bar 取整，提交后的角度有半根 K 线以内的量化误差，
预览期是精确角度。这是坐标模型的固有性质，不新增命令字段。

## 参考点

| 路径 | 参考点 |
|------|--------|
| 绘制多锚点图元 | 最近落下的锚点 |
| 拖拽图元锚点 | 同一图元里离被拖锚点最近的其他点锚点，取拖拽起始快照 |
| 单锚点工具 / 首个锚点 / 单锚点图元 | 无参考点，只剩「关闭磁吸」 |
| 整线拖拽、线中点手柄、单轴锚点（水平线 / 垂直线） | 不锁角：没有方向自由度 |

拖拽取最近的其他锚点而不是固定下标，让参考点始终是用户看到的那一段的另一端，
也不必为每种图元登记配对表；趋势线自然就是另一个端点。

## 投影与阈值

```text
distance = hypot(dx, dy)
angle    = round(atan2(dy, dx) / (π/4)) * (π/4)
point    = origin + (cos(angle), sin(angle)) * distance
```

`distance < ANGLE_LOCK_MIN_DELTA`（4 逻辑像素）时原样返回：离参考点太近时方向噪声大于意义。

## 修饰键与磁吸

Shift 期间只有锁角生效，磁吸让位——值吸附会改写落点，等于把锁定后的方向再拽一次。
映射只有一处（`DrawingInteractionController.resolvePlacementModifiers`）：

| 修饰键 | 行为 |
|--------|------|
| Shift | 锁角；磁吸让位。没有参考点时只关闭磁吸 |
| Ctrl / Meta | 取反磁吸：off 临时开 strong，weak / strong 临时关 |
| 无 | 按当前磁吸档位 |

锁角不写状态：`shiftKey` 逐事件读取，磁吸档位不被改写，松开 Shift 的下一次移动即回到自由角度。

选择模式的 Shift 仍是多选，按下时点击已选图元不会进入拖拽；锁角拖拽已有端点要先按下再按 Shift。

## 约束顺序

`resolveDrawingPointer` 内固定为：出界钳制（`clampPaneId`）→ 锁角 → `clampDataEnd` → 写回。

`clampDataEnd` 是硬约束：回归通道不允许引用未来 Bar，触边时角度让位、X 被裁断。
磁吸在写回之前执行，锁角在场时跳过。

## 宿主契约

宿主把原生 `PointerEvent` 原样交给 Core，不推导也不改写落点。`bindChartInput` →
`handlePointerEvent` → `DrawingInteractionController`，`shiftKey` 天然透传，
Vue / React / Angular / Web Component 共用同一份实现，无需新参数。

宿主已有的锁角实现（如下游 shell 的 `applyAngleLock`）必须删除：参考点只有引擎持有。

## 依赖方向

```text
interaction/   —— 修饰键分发、参考点解析（绘制路径 / 拖拽路径）
geometry/      —— 锁角纯函数与落点约束（定向、钳制、写回）
magnet/        —— 不参与
```

`geometry` 不感知修饰键，只接收 `angleLock?: { origin }`；没有参考点时交互层不传这一项。
