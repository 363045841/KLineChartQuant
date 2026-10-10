# 指标装饰器与目录注册表的分层

## 背景

`@Indicator` 的声明机制与内置目录装配曾同处 `indicatorDefinitionRegistry.ts`，形成模块环：

```
indicatorDefinitionRegistry.ts ──静态──▶ generated/builtinIndicators.ts
        ▲                                            │
        │ 静态（@Indicator 装饰器）                    │ 动态 import()（load 入口）
        │                                            ▼
   renderers/Indicator/*.ts ◀────────────────────────┘
```

- 注册表静态引 `BUILTIN_INDICATOR_MANIFEST` 以获得静态目录；
- 清单每个条目的 `load` 用动态 `import()` 指向具体实现；
- 每个实现静态引注册表的 `Indicator` 装饰器。

闭环边是懒加载动态 import，纯静态图无环、运行时不产生初始化顺序问题；但模块图不再是 DAG，且注册表同时站在「所有实现依赖它」与「它依赖所有实现」两端，属于分层倒置。

## 决策

把机制下沉为叶子模块 `engine/indicators/indicatorDecorator.ts`，注册表只保留目录装配职责。

- 叶子模块只导出：`Indicator` 装饰器、`IndicatorDefinitionConfig`、`IndicatorDefinitionClass`、以及私有身份符号 `definitionMetadata`；只依赖 `errors.js`、`indicatorMetadata.js`、`indicatorContracts.js`、`chartModel/index.js`，**不引清单、不引注册表**。
- Layer 命名同样下沉为叶子模块 `engine/indicators/indicatorLayerNaming.ts`：`normalizeIndicatorId`、`registerIndicatorLayerNaming`、`resolveIndicatorLayerId`。命名规则由注册表在装配定义时写入，实现层只读取；它同样不引清单、不引注册表。
- 所有 `renderers/Indicator/*.ts` 及附属渲染器改为从叶子导入装饰器与 `resolveIndicatorLayerId`；仍需要 `getRegisteredIndicatorDefinition` 等目录查询的文件继续从注册表导入。
- 注册表从叶子导入 `definitionMetadata` 与命名登记函数，并转出 `Indicator` / `IndicatorDefinitionConfig` / `IndicatorDefinitionClass` / `resolveIndicatorLayerId`，维持既有公开出口不变。

依赖方向变为单向：`注册表 → 清单 →(懒) 实现 → 装饰器(叶子)`，任何路径都不再指回注册表。

## 不变量

- 叶子模块不得 import 清单或注册表；它是装饰器机制的唯一归属与唯一实现处。
- `definitionMetadata` 是装饰器写入、注册表读取的唯一共享身份符号，两端必须引用同一个符号值。
- 装饰器只声明元数据，类求值不写全局目录；装配仍由 `registerIndicatorDefinition` / `loadBuiltinIndicators` 负责。
- 目录装配的自动扫描按 TypeScript 符号识别装饰器声明所在文件，因此识别目标指向叶子模块，而非注册表。

## 影响与验收

- 生成器 `scripts/generate-indicator-entrypoints.mjs` 的装饰器识别路径改为叶子模块；其测试夹具同步更新。
- 公开出口：`@363045841yyt/klinechart-core/indicators` 与包主入口仍导出 `Indicator` / `IndicatorDefinitionConfig` / `IndicatorDefinitionClass`，由注册表转出，调用方无需改动。
- 验收：`indicators:check` 目录生成一致；指标按需装配与全部工厂身份一致；类型检查与实际构建通过；模块环消失。
