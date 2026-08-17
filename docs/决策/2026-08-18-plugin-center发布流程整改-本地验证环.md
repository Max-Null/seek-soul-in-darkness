# plugin-center 发布流程整改：npm 发布前必须有本地验证环

日期：2026-08-18
状态：✅ 已落地（本轮 0.1.3 归档已按新流程验证）

## 用户反馈（批评成立）

「我们用 npm 测试是不是有点太不严谨了」——0.1.2 的崩溃级 bug
（ctx.locale 属性访问被 cordis 拒绝 → 插件加载失败）在**发布后**才被用户
真机实测发现。此前流程：改代码 → build → npm publish → 归档 → 打包 →
用户装包测，**没有任何发布前验证**。

## 整改后的流程（每次 plugin-center 改动）

1. 改代码 + build。
2. **本地 loader 冒烟（发布前）**：把 dist 产物装进临时 profile
   （file: 依赖 + pnpm install），用 DSH boot 冒烟验证 loader entry apply
   不炸——「failed to apply loader entry」这类错误在 boot 阶段就会暴露。
3. UI 交互（双语/更新按钮）：dev GUI 或用户轻测。
4. 通过后才 npm publish。
5. SSiD 侧：清 pnpm metadata 缓存（%LOCALAPPDATA%\pnpm-cache\v11\metadata，
   实测位置）→ prepare-runtime → **归档 boot 冒烟**（解压归档 →
   boot-bundled.mjs 用临时 DSH_HOME boot → fetch 200）→ pack → 交付。

## 本轮（0.1.3）验证记录

- 归档重建后执行 boot-bundled 冒烟：临时 DSH_HOME boot 闭包含
  plugin-center@0.1.3，loader apply 全部成功、fetch `/` 200——0.1.2 的
  locale 崩溃缺陷在交付前被排除。

## 决策备查

- 归档冒烟命令：`tar -xzf dsh-runtime.tar.gz`（临时解压回 shell/dsh-runtime）
  → `DSH_HOME=<临时目录> node scripts/boot-bundled.mjs` → 成功后删目录。
- npm 发布后 pnpm metadata 缓存 TTL 导致归档解析旧版本：清
  `%LOCALAPPDATA%\pnpm-cache\v11\metadata{,-full}` 立即生效（实测）。
- age 策略：新版本默认 24h 内不被 ^range 采用，profile-template 的
  minimumReleaseAgeExclude 必须同步更新（0.1.3 已列）。
