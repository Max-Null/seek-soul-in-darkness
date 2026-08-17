# dsh-plugin-center 缺陷修复（0.1.1）：并发更新闪退 + 弹窗缺按钮 + 中文化 + 市场计数

日期：2026-08-17
状态：✅ 代码/发布/归档全链路完成（npm 0.1.1 已发布、归档含 0.1.1、安装包 0:07 出炉）
仓库：H:\MaxNull\WorkStation\dsh-plugin-center（发布 @max-null/dsh-plugin-center@0.1.1）

## 用户实测缺陷（v0.1.4 预发布验收）

1. 点击「Update All」页面闪一下就没下文。
2. 启动 DSH 的「插件更新」弹窗缺少「立即更新」按钮。
3. 「Update All」按钮未中文化（应「更新全部」）。
4. 市场 tab 未打开过时徽标恒 0（预加载机制漏洞）。

## 根因（代码级确认）

1. **updateAll 并发风暴**（client/index.tsx:435）：`for (const u of updates) { void updateOne(u.name) }`
   并发发起 N 个 rpc('update')——每个 update 服务端 spawn `pnpm add -w <pkg>`
   （update.ts:117）阻塞执行，**N 个 pnpm 进程并发写同一 profile**（pnpm
   store 锁/package.json 并发写）→ 多数失败；前端 busyUpdate 状态互相覆盖
   （每个 updateOne 各自 set/清空）→ UI 闪烁；失败 toast 一闪而过 → 「没下文」。
2. **弹窗无更新入口**（client/index.tsx:594-597）：WhatsNewDialog 底部只有
   「稍后」「全部标记已读」，更新动作须手动去更新页。
3. **文案遗漏**：456 行按钮为英文「Update All（N）」。

## 修复方案

1. **updateAll 串行化**：await 逐个 rpc('update')，busy='__all__' 全局禁用；
   结束汇总 toast（成功 N / 失败清单）+ refreshUpdates。
2. **服务端串行链**（engine.ts）：update/install 挂 promise 链锁——任何入口
   的 pnpm 调用串行化（同 profile 禁止并发 pnpm，防再次踩并发）。
3. **弹窗加「立即更新」**：WhatsNewDialog 内串行更新 + busy 态 + toast，
   全部成功自动关闭弹窗；保留「稍后」「全部标记已读」。
4. **中文化**：Update All（N）→ 更新全部（N）；弹窗新按钮「立即更新」。
5. **市场计数预载**（缺陷 4 修复，fdc1177）：marketCount 原本只由 MarketView
   挂载时的 onCount 回调驱动——tab 未打开过就恒 0（服务端缓存有数据也看不到）。
   CenterPanel 挂载即拉 listMarket('all')，done=false 时每 5s 轮询直到完成。
6. **指纹覆盖 lock**（SSiD 侧 prepare-runtime）：指纹 = md5(package.json
   dependencies + pnpm-lock.yaml)——插件版本漂移（0.1.0→0.1.1）也能触发
   重部署（此前指纹只 hash package.json，版本漂移是盲区，同批修复）。

## 交付链

plugin-center：改 client/index.tsx + engine.ts → build-client → bump 0.1.1 →
npm publish → SSiD 侧 prepare-runtime（lock 解析 0.1.1）→ pack → 用户验收。

## 发布链踩坑（归档解析 0.1.0 两轮排查）

1. **pnpm metadata 缓存**：发布后立即 install 解析到旧版本（缓存 TTL 数分钟），
   等待或清缓存可解。
2. **pnpm 11 供应链策略 minimumReleaseAge**：内置默认 24 小时，新版本在龄内
   不被 ^range 采用（精确版本不受限）。本地四变体实验结论：
   A 精确 0.1.1 无豁免 → 0.1.1；B ^0.1.0 无豁免 → 0.1.0；
   C ^0.1.0 + 豁免条目 `pkg@0.1.1` → 0.1.1；D minimumReleaseAge: 0 → 0.1.1。
   采用 C：profile-template/pnpm-workspace.yaml 的 minimumReleaseAgeExclude
   加 `@max-null/dsh-plugin-center@0.1.1`（603c538）。
3. 归档指纹随 lock 变化（07de2fab），首启对比触发重部署 ✓。

## 验证

- [x] build-client 成功、client.js 更新（39.3kb）
- [x] npm publish 0.1.1（用户终端 OTP 完成）
- [x] SSiD 归档含 plugin-center@0.1.1（tar 验证）、指纹变化
- [x] pack 成功（0:07，215.3MB）
- [ ] 用户实测：更新全部串行、弹窗立即更新、中文按钮、市场计数、检查更新反馈
