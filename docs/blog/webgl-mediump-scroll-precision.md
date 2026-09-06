# 一个让 K 线"跟不上手"的精度问题：WebGL `mediump` 与大坐标相减

> 现象一句话版：桌面、手机、Canvas2D 全部正常，偏偏只有低性能平板端，极值标记一直跟着手指平滑移动，K 线却要顿一下才跳到位。

排查到最后，既不是滚动事件丢帧，也不是坐标算错，而是一行 `precision mediump float;` 在移动 GPU 上引发的精度陷阱。这篇文章记录完整的排查思路、根因，以及一类可以在任何 WebGL 2D 渲染器里复用的修复模式。

---

## 一、现象：分层的"不同步"

一个支持 Canvas / WebGL / WebGPU 三种后端的金融图表库，用户反馈：滚动时极值指示器（可视区最高 / 最低价标注）一直平滑跟手，而 K 线却"走了好一段才跳一格"。补充信息非常关键：

- Canvas2D 后端：正常
- 桌面端 WebGL：正常
- 手机 WebGL：正常
- **只有低性能平板 WebGL：异常**

"只有某种设备异常"是精度类 bug 最典型的信号。它意味着代码逻辑本身没变，而是硬件 / 驱动对同一段代码给出了不同结果。

## 二、先排除"看似合理"的答案

排查初期，最直观的怀疑是：滚动事件没同步好。图表有两套坐标来源：

- K 线：由 `scrollLeft`（滚动偏移）驱动，每帧重算可见区与柱坐标
- 极值标记：在 overlay 画布上根据 `kLineCenters`（柱中心）绘制

于是我们补上了滚动状态同步、统一了"先扣滚动量、再按 DPR 对齐"的投影函数，也在逻辑上把两套坐标收敛到同一帧快照。逻辑上已经完全对齐了——但现象没消失。

当"所有逻辑都对齐、却仍只有某类设备错"时，答案基本只剩一个：**数值精度**。

## 三、根因：`mediump` 在移动 GPU 上真的是低精度

### 3.1 精度修饰符是什么

WebGL 的 GLSL 里可以声明三种浮点精度：`lowp`、`mediump`、`highp`。规范只规定**最低**位数，实现可以用更高精度：

| 修饰符 | 规范最低 | 语义 |
|--------|---------|------|
| `lowp` | 9 bit | 接近定点数 |
| `mediump` | 16 bit | 大约 FP16（半精度） |
| `highp` | 32 bit | 接近 IEEE-754 单精度 |

关键点来自 [WebGL Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-precision-issues.html) 和 [Arm 官方文档](https://support.arm.com/documentation/101897/latest/Shader-code/Minimize-precision)：

> 桌面 GPU 几乎总是把所有精度都当作 `highp` 来跑。所以你在 `mediump` 下写的 shader，在桌面上**永远测不出问题**——因为它实际上跑的是 FP32。
> 移动 GPU 才真正以 16 bit 半精度执行 `mediump`。

这正是"桌面正常、手机正常、唯独低性能平板异常"的根源：**桌面把 `mediump` 升格为 `highp`，而低性能平板（往往采用降频或精简的 Mali / 入门 Adreno 系列）忠实按 FP16 执行**。手机正常可能只是恰好那颗 GPU 也把 `mediump` 当了 `highp`。

Unity 官方文档里有一张很直白的 [移动 GPU 精度对照表](https://docs.unity3d.com/560/Documentation/Manual/SL-DataTypesAndPrecision.html)，显示几乎所有移动 GPU 的 `float` 是 32 bit、`half` 只有 16 bit；而 PC GPU 无论写什么都是 32 bit。

### 3.2 为什么滚动时精度会崩

我们的 K 线顶点着色器长这样（已简化）：

```glsl
precision mediump float;        // ← 问题在这行

in vec4 a_rect;                 // 柱的世界坐标 (x, y, width, height)
uniform float u_scrollX;        // 当前滚动偏移

void main() {
    vec2 position = vec2(
        a_rect.x - u_scrollX,   // 大数相减！
        ...
    );
}
```

假设数据里有几万根 K 线，滚动到靠后位置时，`a_rect.x` 可能是 **10000.8**，而 `u_scrollX` 是 **9980.6**，期望结果是 20.2。

问题在于：

- **FP16（`mediump`）只有约 11 位有效尾数**。当数值达到 10000 这个量级时，FP16 能表达的"最小步长"已经不是 0.1，而是粗得多（大约 8 个单位级）。于是 `10000.8 - 9980.6` 在两个都经过 FP16 量化的大数上进行，结果不是 20.2，而是被吞成 16 或 24 这类"跳格"的值。
- 每滚动一丁点，`u_scrollX` 的增量都在 FP16 的量化阈值以下，被抹平；只有当位移累计到足以改变量化结果时，K 线才"啪"地跳一格。
- 而极值标记走的是 Canvas2D 路径，在 **CPU 上用 64 位双精度**计算，`worldX - scrollLeft` 精确无损失——所以它一直平滑跟手。

于是两条渲染路径在数值精度上"分层"了：一条双精度、一条 FP16。

### 3.3 这是个普遍问题，不止 K 线

这其实是一个被业界反复踩过的坑：

- **Mapbox GL** 长期维护"在移动设备上把 shader 精度提升到 `highp`"的修复，维护者在 issue 里直言："顶点着色器应该无条件使用 `highp`，几乎没有坏处"（[mapbox-gl-js#2096](https://github.com/mapbox/mapbox-gl-js/issues/2096)）。
- **Emscripten** 曾给所有顶点着色器默认加 `precision mediump float;`，结果被 Greggman 指出这会在移动端破坏内容——因为 GLSL ES 规范里**顶点着色器本来就默认 `highp`**（[emscripten#8627](https://github.com/emscripten/emscripten/issues/8627)）。
- **Re:Earth / Cesium 等全局场景引擎**专门讲 RTC / RTE 两种技巧，本质都是"把顶点坐标搬到大数附近，避免 GPU 上的大数运算丢精度"（[high-precision-rendering](https://reearth.engineering/posts/high-precision-rendering-en/)）。
- 即使声明了 `highp`，某些驱动还有各种精度回退怪癖（[Khronos WebGL#3351](https://github.com/KhronosGroup/WebGL/issues/3351) 就记录了 Adreno 结构体成员精度被悄悄降半）。

所以我们的修复思路，正好是"改一行 + 改一个架构习惯"的组合。

## 四、修复：把大数相减从 GPU 挪回 CPU

### 4.1 第一招：顶点着色器升到 `highp`

```glsl
precision highp float;   // 顶点着色器默认就该是 highp
```

这一步让移动 GPU 上以 FP32 执行顶点运算，立刻解决"大数相减"的精度问题。对大多数现代移动 GPU，顶点着色器本来就支持 `highp`（规范要求顶点必须支持），所以几乎无兼容性风险。

> 注意：片元着色器里 `highp` 是**可选**的，老设备不支持、会编译失败。所以只对**顶点**着色器升 `highp` 是安全且推荐的；片元着色器保持 `mediump` 通常足够（就像 Chrome 官方博客建议的那样：[use-mediump-precision-in-webgl-when-possible](https://developer.chrome.com/blog/use-mediump-precision-in-webgl-when-possible)）。

### 4.2 第二招（更治本）：不在 GPU 里做世界坐标相减

光升 `highp` 就够了吗？对这个问题够，但对**架构**不够好。

我们真正想做的是：**永远不要在 GPU 里做"大世界坐标 - 大滚动偏移"的运算**。理由有两个：

1. 就算 `highp`，也只是 32 位单精度；滚动到数万根柱时，把「精确到 0.1 的大数」塞进 FP32 依然有损失，只是损失比 FP16 小得多。
2. 依赖"升精度"需要每个 shader 都记得写对，一旦漏掉一个就又回到 FP16 陷阱。与其到处贴膏药，不如从源头消除"大数相减"。

于是我们把 K 线的世界坐标投影（`worldX - scrollLeft`，再按 DPR 对齐到物理像素）在 **CPU 的双精度空间**提前算好，**只把小坐标（视口局部坐标）上传给 GPU**，shader 里 `u_scrollX` 直接传 0：

```typescript
// CPU：双精度下精确完成 世界坐标 → 视口局部物理像素
const screenLeft  = round((worldLeft  - scrollLeft) * dpr) / dpr
const screenRight = round((worldRight - scrollLeft) * dpr) / dpr

rectScreen[offset]     = screenLeft
rectScreen[offset + 2] = Math.max(1 / dpr, screenRight - screenLeft)
```

现在 GPU 拿到的坐标是几十、几百这种小数值，即使某个 shader 忘了写 `highp`、被当成 FP16，也远不会踩到量化阈值。**小数值对小精度天然免疫**，这才是根本解法。

这正是地图引擎里 RTC（Relative-To-Center）的二维版本：**把坐标搬到局部原点附近，让 GPU 永远处理小数字**。

## 五、这次修复沉淀下来的三条原则

1. **坐标系要有层次，别让 GPU 做长距离运算。** 世界坐标 ↔ 屏幕坐标的换算放在 CPU，GPU 只处理视口局部的小坐标。
2. **顶点着色器默认 `highp`。** 它是规范强制支持的，移动端也几乎都支持；片元着色器的 `highp` 才是可选项、要谨慎。
3. **"某类设备才出问题" = 数值精度问题。** 桌面把所有精度都当 FP32，测不出 FP16 的错；要真正验证，要么真机，要么用 Chrome 的 `--emulate-shader-precision` 模拟移动精度（[NVIDIA WebGL meetup](https://www.khronos.org/assets/uploads/developers/library/2015-gtc/NVIDIA-Shaders-WebGL-Meetup-GTC_Mar15.pdf)）。

## 六、结语

一个看似"滚动不同步"的渲染 bug，最后落在一行 `mediump` 上。它提醒我们：**在 GPU 上，"看起来一样的数字"在不同设备上精度可能差 16 倍**。

对我们来说，最有价值的不是记住"要写 highp"，而是形成一个习惯：**凡是涉及滚动、平移、缩放这类会在每帧改变的大偏移量，坐标换算尽量留在 CPU，让 GPU 只处理局部小数值。** 这样无论将来设备怎么变、精度怎么降，都不会再踩同一个坑。

---

*相关代码：KLineChartQuant（Canvas / WebGL / WebGPU 混合渲染的金融图表库），修复位于 WebGL 后端矩形上传前的坐标投影，以及 WebGL 顶点着色器的精度声明。*
