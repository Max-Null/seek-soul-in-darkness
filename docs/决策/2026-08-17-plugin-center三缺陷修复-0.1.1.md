# dsh-plugin-center 缺陷修复（0.1.1）：并发更新闪退 + 弹窗缺按钮 + 中文化 + 市场计数

日期：2026-08-17
状态：进行中（代码已提交 fdc1177，待用户 npm publish 后重建归档）
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

## 验证

- [ ] build-client 成功、client.js 更新
- [ ] npm publish 0.1.1
- [ ] SSiD 归档含 plugin-center@0.1.1、指纹变化
- [ ] 用户实测：更新全部串行逐个更新 + 弹窗立即更新 + 中文按钮
