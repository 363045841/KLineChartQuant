---
name: kline-blur-regression
description: Use this skill when users report K-line/canvas blur after opening DevTools, resizing viewport, or under non-integer DPR. Focus on commit-bounded regression analysis and minimal, reversible rendering fixes.
version: 1.0.0
---

# K-line Blur Regression Skill

## Goal

快速定位并修复这类回归：
- 正常时清晰，打开控制台/调整窗口后变糊；
- 多见于非整数 DPR（如 1.25, 1.5, 1.75）；
- 用户要求“只在指定提交范围内找问题”。

## When to use

触发关键词：
- “打开控制台后 K 线模糊/发糊”
- “DevTools 打开后变虚”
- “非整数 DPR 模糊”
- “只在某几个提交中排查”

## Core principles

1. **先定界再分析**：严格按用户给的 commit 范围排查，不扩面。  
2. **优先查像素映射链路**：Canvas backing store 尺寸、CSS 尺寸、`ctx.scale(dpr,dpr)` 是否一致。  
3. **最小修复**：只改引入回归的 hunk，避免连带“优化”。

## Investigation checklist

### 1) Build bounded diff

- 列出 commit 区间变更文件：
  - `git diff --name-only <good_commit>..<bad_commit>`
- 先看渲染核心路径：
  - `src/core/paneRenderer.ts`
  - `src/core/chart.ts`
  - `src/core/renderers/yAxis.ts`
  - `src/utils/kLineDraw/axis.ts`
  - `src/core/renderers/Indicator/scale/*.ts`

### 2) Prioritize high-risk patterns

重点检索以下改动：
- `canvas.width/height` 与 `style.width/height` 计算方式变化；
- `Math.round(...)` 替换 `roundToPhysicalPixel(...)`；
- `setTransform/scale` 调用顺序变化；
- 轴宽来源从配置改为 `canvas.width / dpr`（或反之）。

### 3) Validate with minimal A/B

- 在 bad commit 复现；
- 只回滚单个可疑 hunk 再验证；
- 若恢复清晰，确认根因成立。

## Known fix pattern (this repo)

本仓库一次已验证根因：`PaneRenderer.resize()` 中 CSS 尺寸策略改变导致非整数 DPR 下重采样风险上升。  
修复方式（最小回退）是恢复：

```ts
plotCanvas.style.width = `${plotCanvas.width / dpr}px`
plotCanvas.style.height = `${plotCanvas.height / dpr}px`
yAxisCanvas.style.width = `${yAxisCanvas.width / dpr}px`
yAxisCanvas.style.height = `${yAxisCanvas.height / dpr}px`
```

而不是固定写逻辑尺寸：

```ts
plotCanvas.style.width = `${width}px`
plotCanvas.style.height = `${height}px`
```

## Guardrails

- 不要把“用户限定范围外”的问题混入本次结论。  
- 不要顺手改 unrelated 文件。  
- 不要在未复现时给出肯定根因。

## Verification steps

1. 在非整数 DPR 环境（或系统缩放 125%/150%）运行。  
2. 记录打开 DevTools 前后 K 线清晰度是否变化。  
3. 触发一次 resize（拖动窗口/切换布局）。  
4. 确认修复后仍清晰，且无新错位（右轴/十字线/网格）。

## Response template

- 先给“结论 + 文件行位点”；
- 再给“为什么只改这处”；
- 最后给“如何验证复现已消失”。
