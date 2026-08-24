# vendor 目录说明（SSiD 内置定制）

profile-template 的依赖清单通过本目录引用 SSiD 侧定制/固化的包源。任何条目
都是「安装版首装即生效」的内容，改动后必须重新生成运行时归档：

```sh
node scripts/prepare-runtime.mjs   # 重建 dsh-runtime.tar.gz（归档带 vendor 指纹）
```

## 条目

### open-sea-skin-1.2.1.tgz

来源：上游 [d-dev0101/open-sea-skin](https://github.com/d-dev0101/open-sea-skin)
v1.2.1。SSiD 侧有两处定制，与上游源无关：

1. **启用开关 UI（quick controls）**：上游 enable-toggle 功能仍在未合并的
   PR 中（`feat/quick-controls-enable-toggle`），SSiD 归档提前合入对应构建产物
   （browser bundle / native loader / renderer），使安装版开箱即有
   「启用海洋皮肤」开关与设置面板。
2. **默认不开启**：`DEFAULTS.enabled` 为 `false`，且 `normalize` 采用严格
   opt-in 语义（仅显式 `true` 才开启）——安装版首装不渲染海洋（WebGPU/
   WebGL2 重负载），用户需要时在设置面板手动启用。

再生成方式（幂等补丁，缺锚点即报错防结构漂移）：

```sh
node scripts/repack-open-sea-skin-vendor.mjs
node scripts/prepare-runtime.mjs
```

### dsh-capture / dsh-ssid-panels / dsh-ssid-zh-ui / dsh-header-unify

Max-Null 自有 @max-null/* 插件的源码目录（`file:./vendor/<name>` 引用）：
SSiD 集成版本直接随归档发布，不依赖 npm 发布节奏。更新方式为替换目录内容
后重建归档。
