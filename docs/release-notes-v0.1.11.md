# v0.1.11 发布说明（2026-08-23）

> 本地构建验证版（多次重打）：未对外分发，内容已并入 v0.1.12 正式发布。

## 新增与修复

- **壳内捆绑 pnpm@11.21.0**：应用私有（dependencies + asarUnpack），启动注入
  `SSID_PNPM`——插件更新使用与归档 store 布局一致的 pnpm，修复本机全局
  pnpm 版本不一致导致的 `ERR_PNPM_UNEXPECTED_STORE`
- **pnpm 归入 dependencies**：electron-builder 只打包 prod deps，此前捆绑
  pnpm 不在 asar 内（缺失修复）
- **pending 插件安装优先用捆绑 pnpm**：重启消费路径（SSID_PNPM）自更新
  鸡生蛋防护
- **归档 profile 钉 plugin-center ^0.2.10**：首装即带两段式更新（SSID_PNPM）
  的 host，无需首次手动自更新
- **open-sea-skin vendor 同步**：冒烟测试修复（允许 WebGL2 回退 + 无 WebGPU
  低负载档 + 去掉 navigator.gpu 预检）、UI 入口修复（启动即禁用时按钮始终可达）

## 说明

- 未外发：仅作为本地/内测构建验证；完整变更以 v0.1.12 发布说明为准。
