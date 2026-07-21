---
name: update-version
description: 升级组件库发布包版本
---

1. 需要且只要更新以下文件中的版本:
@packages\core\package.json
@packages\desktop-electron\package.json
@packages\core\src\version.ts
@packages\vue\package.json

版本格式eg:
0.9.0-alpha.1 // alpha
0.9.0 // 正式版本

2. 使用git tag打上版本标签, 版本要带上 v,以触发 @.github\workflows\release.yml 发布npm包
