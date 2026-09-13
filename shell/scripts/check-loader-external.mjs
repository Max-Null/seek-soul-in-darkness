#!/usr/bin/env node
/**
 * check-loader-external —— bundle 不得内联 DSH（内核侧的 Loader peer 必须唯一）
 *
 * 为什么值得一个门（实测故障，故障面大、检查成本极低）：
 * v0.3.0 装机后插件中心 / MCP 面板 / 侧栏底栏全部失效，请求返回 405。根因是
 * `kernel.bundle.mjs` / `kernel-child.bundle.mjs` 把 `@deepseek-ai/dsh-app-boot`
 * 与 `cordis-plugin-include` 内联了（kernel.ts 静态 import 了它们，esbuild 顺链
 * 内联），于是 boot 用的 include/loader 组合与插件从 profile 闭包加载的那一份
 * 不是同一个 peer —— 插件的 RPC channel 注册不到宿主上，`connection.rpc.handle`
 * 静默失败。
 *
 * DSH 官方对此有明文规则（packages/ui/app-boot/tsdown.config.ts 的注释）：
 *   Embed Include while keeping Loader external so the built include tree
 *   and app host bind to one Loader peer.
 * 即：内联 Include，但必须保持 Loader external。这条规则此前只在源码注释里，
 * 没有任何文档，所以门就是它的落地形式。
 *
 * 判定（四条，任一不满足即违规）：
 *   1. 构建脚本必须含 `--external:@deepseek-ai/*`（根治项：不改脚本，下次重建
 *      就会把内联带回来）
 *   2. 产物不得出现 include 的实现特征（`applyEntryPatches` / `composeEntries`）
 *   3. 产物体积不得超过上限（内联 DSH 会让它从 ~21 KB 涨到 ~257 KB）
 *   4. **进包的那一份也必须合格**（见下）
 *
 * 产物缺失不算违规（日常可能没构建），但脚本那一项总是可判，所以不会空语料。
 *
 * ── 第 4 条为什么必须存在（实测漏洞）────────────────────────────────────────
 * 只查「仓库根产物对不对」是不够的：真正被交付的是 `extraResources` 拷进安装包的
 * 那一份。曾经发生过——构建脚本已经修好、仓库根产物也已是 23 KB 外置版，但重新
 * 打包时沿用了上一次构建遗留的 263 KB 内联文件，于是**装进系统的仍是内联内核**，
 * 405 照旧。只盯源头不盯落点，这个故障会原样再犯。
 *
 * 该层只在打过包（`dist-electron/` 存在）时生效：没打包不算违规。
 *
 * 自测：SSID_BUNDLE_DIR 指向临时目录，演练的是门本身而不是它的副本。
 * 退出码：0 通过 / 1 违规 / 2 空语料。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGate } from './lib/gate-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const BUNDLE_DIR = process.env.SSID_BUNDLE_DIR ?? SHELL;

const gate = createGate({ id: 'check-loader-external', label: 'bundle 不得内联 DSH', base: REPO });

/**
 * 内联 DSH 的产物特征：include 的**内部实现**函数名。
 *
 * 只取 `applyEntryPatches` —— 它只存在于 include 的实现里，kernel.ts 从不直接调用。
 * 初版把 `composeEntries` 也当特征，那是错的：kernel.ts 自己会调
 * `dsh.composeEntries(...)`，这个名字在任何正确产物里都会出现，门会永远误报。
 */
const INLINE_MARKERS = ['applyEntryPatches'];

/**
 * 反向判据：产物必须保留对 DSH 的 external 引用。
 * 若一条都没有，说明整棵 DSH 被内联了 —— 这比逐个特征串更可靠。
 */
const EXTERNAL_IMPORT = /(?:from\s*"@deepseek-ai\/|import\("@deepseek-ai\/)/;

/** 产物体积上限。正确值约 21 KB，内联 DSH 后约 257 KB。 */
const MAX_KB = 64;

/** 必须出现在构建脚本里的 external 参数。 */
const REQUIRED_EXTERNAL = '--external:@deepseek-ai/*';

const SCRIPT_NAMES = ['bundle-kernel', 'bundle-kernel-child'];

/**
 * 交付落点：electron-builder 把 `extraResources` 里声明的产物拷到这里。
 *
 * `kernel.bundle.mjs` 不在 extraResources 里（不进包），所以这一层只查
 * `kernel-child.bundle.mjs`。
 */
const SHIPPED_CANDIDATES = [
  path.join(BUNDLE_DIR, 'dist-electron', 'win-unpacked', 'resources', 'kernel-child.bundle.mjs'),
];

// ── 1. 构建脚本 ──────────────────────────────────────────────────────────────
const pkgPath = path.join(BUNDLE_DIR, 'package.json');
if (!fs.existsSync(pkgPath)) {
  // 也记一次 inspect：这个位置**被检视过**，只是文件不在 —— 否则 done() 会
  // 按「空语料」报 exit 2，把「配置坏了」误报成「门自己没跑起来」。
  gate.inspect();
  gate.violation(pkgPath, null, `找不到 package.json（SSID_BUNDLE_DIR=${BUNDLE_DIR}）`);
} else {
  let scripts = {};
  try {
    scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts ?? {};
  } catch (cause) {
    gate.violation(pkgPath, null, `package.json 解析失败：${cause.message}`);
  }
  for (const name of SCRIPT_NAMES) {
    const cmd = scripts[name];
    if (typeof cmd !== 'string') {
      gate.violation(pkgPath, null, `缺少构建脚本 ${name}`);
      continue;
    }
    gate.inspect();
    if (!cmd.includes(REQUIRED_EXTERNAL)) {
      gate.violation(pkgPath, null, `${name} 缺少 ${REQUIRED_EXTERNAL} —— 重建会把 DSH 内联回 bundle`);
    }
  }
}

/**
 * 检一个产物文件，判据 2/3。返回可读的体量描述（供正常路径打印）。
 */
function checkBundle(file) {
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of INLINE_MARKERS) {
    if (text.includes(marker)) {
      gate.violation(file, null, `内联了 DSH：出现 include 的实现特征 \`${marker}\`（应为 external import）`);
    }
  }
  if (!EXTERNAL_IMPORT.test(text)) {
    gate.violation(file, null, '产物里没有对 @deepseek-ai/* 的 external 引用 —— 说明 DSH 被整棵内联了');
  }
  const kb = fs.statSync(file).size / 1024;
  if (kb > MAX_KB) {
    gate.violation(file, null, `体积 ${kb.toFixed(1)} KB 超过上限 ${MAX_KB} KB —— 通常意味着 DSH 被内联（正确值约 21 KB）`);
  }
  return `${kb.toFixed(1)} KB`;
}

// ── 2/3. 仓库根产物 ──────────────────────────────────────────────────────────
for (const name of ['kernel.bundle.mjs', 'kernel-child.bundle.mjs']) {
  const file = path.join(BUNDLE_DIR, name);
  if (!fs.existsSync(file)) {
    gate.info(`跳过（未构建）：${name}`);
    continue;
  }
  gate.inspect();
  gate.info(`${name}：${checkBundle(file)} ✓`);
}

// ── 4. 进包产物 ──────────────────────────────────────────────────────────────
// 只在打过包时生效。它的存在本身就是证据：说明有一次交付正在成形，
// 此时落点若是内联版，装上去必然复现 405。
for (const file of SHIPPED_CANDIDATES) {
  if (!fs.existsSync(file)) continue;
  gate.inspect();
  gate.info(`进包产物：${checkBundle(file)} ✓（${path.relative(REPO, file)}）`);
}

process.exit(gate.done());
