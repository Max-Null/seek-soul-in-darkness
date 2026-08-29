# vendor 目录说明（SSiD 内置定制）

profile-template 的依赖清单通过本目录引用 SSiD 侧定制/固化的包源。任何条目
都是「安装版首装即生效」的内容，改动后必须重新生成运行时归档：

```sh
node scripts/prepare-runtime.mjs   # 重建 dsh-runtime.tar.gz（归档带 vendor 指纹）
```

## 条目

### dsh-capture / dsh-ssid-panels / dsh-ssid-zh-ui / dsh-header-unify

Max-Null 自有 @max-null/* 插件的源码目录（`file:./vendor/<name>` 引用）：
SSiD 集成版本直接随归档发布，不依赖 npm 发布节奏。更新方式为替换目录内容
后重建归档。

### dsh-genui（来源仓库 omdsh-dev/dsh-genui；npm 发布名 @changfenhuang/dsh-genui）

第三方 genui 的 vendor 固化（`file:./vendor/dsh-genui`）。基线 = 上游
v0.9.2 + **SSiD 面板样式修复**：会话面板 dock 对齐宿主 composer 宽度轴、
头部/body 分隔线、badge 间距（--dsl-g-* token 作用域修复）、chevron 换宿主
图标——修复已提上游 PR [omdsh-dev/dsh-genui#58](https://github.com/omdsh-dev/dsh-genui/pull/58)。
上游合并并发布新版本后，切换到 npm 声明并移除本 vendor。本地开发/重构建：
`H:\MaxNull\WorkStation\dsh-genui`（Windows 构建绕过 `rm -rf`：`Remove-Item lib -Recurse;
pnpm exec tsc -p tsconfig.json; pnpm exec tsdown`）。
`genui` skill 教学（`SKILL.md`）同步预置在 `profile-template/skills/genui/`。

### dsh-context-doctor

第三方上下文审计插件（git 产物，无 npm 发布）的 vendor 固化
（`file:./vendor/dsh-context-doctor`）。基线 = `github:Zhenyu98/dsh-context-doctor#main`
v0.6.1（构建产物已入库，无需本地构建）。已知局限见上游
[issue #8](https://github.com/Zhenyu98/dsh-context-doctor/issues/8)（symlink 指令链
双算、技能目录 scope 语义）；日常诊断请显式传 `cwd=<会话工作目录>`。

