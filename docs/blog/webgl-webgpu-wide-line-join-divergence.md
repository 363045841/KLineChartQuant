# WebGL 和 WebGPU 画出来的线不一样：一个被误判成"抗锯齿"的粗线 join 分叉

> 现象一句话版：同一条 MA20，WebGPU 后端平滑均匀，切到 WebGL 后端后每个拐点都鼓出一小块，第一眼看上去像是抗锯齿失效了。

查下来，抗锯齿从头到尾都是好的。两个后端确实都是 4x MSAA，差异来自更前面的一步：**粗线的顶点几何是两个后端各写各的**，一个用 miter join，一个用逐段独立四边形。拐点处累积出来的形状差，被 MSAA 平滑之后，看着就"像 AA 没生效"。

这篇文章记录误判是怎么发生的、真正的分叉在哪、以及最后怎么收成一份实现。

---

## 一、现象：先怀疑抗锯齿

图表支持 Canvas / WebGL / WebGPU 三种后端。切到 WebGL 后，最直观的差异出现在斜线和指标折线上：

- WebGPU：线条粗细均匀，拐点圆顺；
- WebGL：线条在拐点附近明显更粗，尖角处甚至鼓出一块；
- 拉近看边缘：两边都有抗锯齿，只是 WebGL 的"块"更大更毛。

"看起来像抗锯齿没生效"是最自然的结论。于是第一步不是改代码，而是先把抗锯齿这件事查清楚。

## 二、抗锯齿其实是好的，先排除

两个后端的 MSAA 写法不同，但都成立。

**WebGL** 的 context 是有意开 `antialias: false` 的：

```ts
this.canvas.getContext('webgl2', {
  alpha: true,
  antialias: false,   // 关掉默认 framebuffer 的隐式 AA
  ...
})
```

关掉它，是因为真正的 MSAA 走的是离屏多重采样 renderbuffer，最后再 resolve 回可见画布：

```ts
const samples = Math.min(4, Number(gl.getParameter(gl.MAX_SAMPLES)) || 0)
gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height)
// ...绘制全部写入这个 MSAA target...
gl.blitFramebuffer(src..., dst..., gl.COLOR_BUFFER_BIT, gl.NEAREST)  // 一帧一次 resolve
```

**WebGPU** 则在 pipeline 上声明 4x，并用一张 4 采样纹理做 resolveTarget：

```ts
primitive: { topology },
multisample: { count: 4 },
```

结论很清楚：**两边都开着 4x MSAA，抗锯齿不是根因。** 那差异只能来自 MSAA 之前的几何——MSAA 只是忠实地把"更大的形状"平滑出来。

## 三、根因：粗线几何两个后端各写各的

问题出在"把一条折线展开成有宽度的三角形"这一步。WebGL 和 WebGPU 各有一份实现，做法完全不同。

### 3.1 WebGL：miter join

WebGL 的 `buildJoinedPolylineGeometry` 会为每个顶点算一条 miter 法线：

```ts
miterNX = prevNormal.nx + currNormal.nx
miterNY = prevNormal.ny + currNormal.ny
// ...
const dot = miterNX * currNormal.nx + miterNY * currNormal.ny
const scale = 1 / Math.max(MITER_DOT_MIN, Math.abs(dot))   // MITER_DOT_MIN = 0.5
miterNX *= scale
miterNY *= scale
```

这是一套典型的 miter join：拐角越尖，`dot` 越小，`scale` 越大，顶点就沿着角平分线往外撑。因为有 `MITER_DOT_MIN = 0.5` 兜底，最坏情况下顶点会被撑到 **半线宽的 2 倍**，也就是单侧整整一个线宽。相邻两段共用同一个 miter 顶点，所以线条是连续的，但每个拐点都会"鼓"一下。

### 3.2 WebGPU：逐段独立四边形

WebGPU 的 `buildWideLine` 简单得多，每段自己算自己的法线，各生成一个四边形：

```ts
const nx = (-dy / length) * width * 0.5
const ny = (dx / length) * width * 0.5
// 每段的起点、终点都只用本段法线，段与段之间不做衔接
```

没有 miter，也就没有拐点膨胀；代价是拐弯外侧会留下小的缺口（butt cap）。

### 3.3 两种几何差在哪

拿一段 90° 转弯举例：

| | WebGL（miter） | WebGPU（逐段 quad） |
|---|---|---|
| 拐点外侧 | 顶点外撑到约 1.41 倍半线宽 | 保持半线宽，外侧留缺口 |
| 拐点内侧 | 同样被 miter 撑开 | 保持半线宽 |
| 线条连续性 | 连续 | 段与段之间有缝 |
| 锐角处 | 最多撑到单侧一个线宽 | 不变 |

指标线（MA、BOLL 之类）本身拐点密集，两套几何叠加上去，观感差距自然被放大。再被 4x MSAA 一平滑，miter 撑出来的尖角就变成了一个个"鼓包"，看起来非常像抗锯齿处理不一致。

**根因不是抗锯齿，是两份几何实现。**

## 四、修复：收成一份共享实现

既然两个后端都在描述同一种东西，就不该维护两套算法。修复方式是把粗线几何抽成公共模块，两个后端共用：

```ts
// packages/core/src/rendering/render/wideLineGeometry.ts
export function buildWideLineGeometry(
  points: ReadonlyArray<{ x: number; y: number }>,
  width: number,
): Float32Array | null { /* 逐段四边形 */ }
```

- WebGPU：删掉本地 `buildWideLine`，改为引用公共实现；
- WebGL：`getLineGeometry` 改为引用公共实现，同时删掉 miter 相关代码，包括 `buildJoinedPolylineGeometry`、`PolylineNormal`、`MITER_DOT_MIN`（约 130 行）。

几何的输入是逻辑坐标和逻辑线宽，物理像素换算留给各后端 shader，公共模块不关心 DPR。

这样一来，无论切到哪个后端，同一条指标线的形状完全一致，测试也能覆盖同一份逻辑。

## 五、沉淀下来的两条经验

1. **"看起来像抗锯齿问题"，先验证抗锯齿，再去看几何。** MSAA 只会把已有的形状平滑出来；形状本身不干净时，加抗锯齿只会让差异更显眼。WebGL 的 `antialias: false` 不代表没有 MSAA——离屏多重采样 + `blitFramebuffer` resolve 是标准写法。
2. **多后端项目的公共几何只应有一份实现。** 不同后端可以有不同的 API、不同的资源管理，但"一条折线有多宽、拐点怎么接"这种业务几何语义不该各写一遍。两份实现就是两条会各自漂移的真相。

如果以后想要更平滑的接头，正确做法是给**两个后端**加同一种 join（比如都做 miter，或都做 round），而不是只改其中一个。

---

*相关代码：KLineChartQuant（Canvas / WebGL / WebGPU 混合渲染的金融图表库）。新增共享几何 `packages/core/src/rendering/render/wideLineGeometry.ts`，WebGL 与 WebGPU 后端统一调用；WebGL 侧删除了原有的 miter join 实现。*
