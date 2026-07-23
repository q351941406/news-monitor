# 01 - 搭建 Vitest 测试环境

Type: task
Status: claimed
Blocked by: none

## 目标

安装 Vitest，配置测试环境，让项目可以运行测试。

## 具体步骤

1. 安装 vitest + @vitest/coverage-v8
2. 在项目根目录创建 vitest.config.ts（使用 tsx 作为处理器）
3. 配置 tsconfig.json 支持 vitest 类型
4. 写一个简单的 smoke test 验证环境跑通
5. 在 package.json 添加 `test` 脚本
6. 运行确认

## 完成条件

- `npm test` 可以运行
- smoke test 通过
