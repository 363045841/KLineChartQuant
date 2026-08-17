---
name: codereview
description: Use when reviewing code for code smells and architecture problems, especially state consistency, layer boundaries, model contracts, and change propagation.
---

# Code Review Principles

在进行代码和架构 Review 时，重点检查以下四类问题：

## 1. 状态一致性

检查同一业务状态是否被拆成多个字段、缓存或存储位置维护。

- 优先确认是否存在单一事实来源。
- 派生值应通过 computed 或统一投影获得。
- 关注手动同步、影子缓存和异步覆盖造成的不一致。

## 2. 边界职责

检查各层是否职责重叠。

- 避免多个层重复保存同一状态。
- 避免无实际价值的转发方法和包装层。
- 公共 API 不应暴露未完成或仅属于内部实现的抽象。

## 3. 模型契约

检查协议模型、领域模型和 UI 模型是否有清晰且唯一的权威定义。

- 避免重复定义结构相同的类型。
- 若协议模型就是前端标准模型，直接复用领域类型。
- 若两者确实不同，必须明确字段转换、校验和默认值规则。

## 4. 变更传播

检查重命名、状态重构和公共 API 变化是否同步传播到代码、测试、文档和导出入口。

- 搜索旧名称和残留引用。
- 确认测试代码也经过 TypeScript 检查，避免只通过运行时转译。
- 检查包级导出、README、设计文档和框架绑定是否同步。

## Review Output

优先报告可复现的问题和高风险坏味道，并提供文件与行号。
每个 finding 说明：问题是什么、为什么有风险、建议如何收敛。
如果没有发现问题，说明已检查的边界和剩余测试风险。
