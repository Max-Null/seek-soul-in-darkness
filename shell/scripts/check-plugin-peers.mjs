#!/usr/bin/env node
/**
 * check-plugin-peers —— 插件的 @deepseek-ai/* peerDeps 是否覆盖当前内核版本
 *
 * 为什么值得一个门：插件声明 `peerDependencies` 是对内核的兼容承诺，但内核
 * 升级时这些范围不会自动跟着走。实测：`@max-null/dsh-ssid-panels` 0.1.9 仍声明
 * `@deepseek-ai/dsh-session@^0.1.0-rc.6`，而同批的 plugin-center / skill-mcp-center
 * 已在 `^0.1.1-rc.1` / `^0.1.2-rc.1` —— 这类漂移靠人记忆，靠不住。
 *
 * 判定：把每个 peerDep 的范围与**目标内核版本**做 semver 覆盖判断。
 *   - 覆盖 → 通过（说明这个插件在当前内核上仍被允许加载）
 *   - 不覆盖 → 违规（真不兼容，装上去必然出问题）
 *
 * 范围是「覆盖性」而非「是否最新」：`^0.1.0-rc.6` 覆盖 `0.1.5-rc.2`，所以它
 * **不是**本门的违规项；「下限应对齐当前内核」属风格问题，只写进规范不做门。
 * 这个区分是本门最重要的设计决定 —— 门只回答「这样写会不会坏」。
 *
 * 目标内核版本的单一来源是 `shell/profile-template/pnpm-workspace.yaml`：它是
 * 发版基准，所有 @deepseek-ai/* 在那里 pin 成同一个版本。从仓库内取，门才能在
 * 离线与 CI 下跑。
 *
 * 自测：SSID_PLUGIN_DIRS 注入临时目录、SSID_KERNEL_VERSION 覆盖目标版本。
 * 退出码：0 通过 / 1 违规 / 2 空语料。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGate, walk } from './lib/gate-report.mjs';
// 复用 SSiD 自己的 semver 解析（parseVersion / compareVersions，含 prerelease 语义），
// 而不是赌 `require('semver')` 能在 pnpm 的严格布局里解析到 —— 那次会让门悄悄走降级
// 分支，把 `~0.1.3` 这种真违规判成通过（实测踩到）。
import { compareVersions, parseVersion } from '../lib/profile-merge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');

const gate = createGate({ id: 'check-plugin-peers', label: '插件 peerDeps 覆盖性', base: REPO });

/**
 * 目标版本表：包名 → 该包自己的 pin 版本。
 *
 * **不能只取「出现最多的那个版本」当所有 `@deepseek-ai/*` 的目标**。这个命名空间下
 * 混着几条独立的版本线：`cordis` 在 4.x、`cosmokit` / `schemastery` 各有自己的号，
 * 只有 `dsh-*` 才跟着内核版本走。拿内核版本（0.2.0-rc.1）去判 `^4.0.1` 必然误报
 * —— 2026-09-29 把检视面扩到 `max-null-plugins/` 后，一次性冒出十几条这种假违规。
 *
 * `SSID_KERNEL_VERSION` 仍保留：给定时所有 peer 都用它判（自测造语料靠这个）。
 */
function readTargets() {
  const yamlPath = path.join(SHELL, 'profile-template', 'pnpm-workspace.yaml');
  if (!fs.existsSync(yamlPath)) return null;
  const text = fs.readFileSync(yamlPath, 'utf8');
  const pins = new Map();
  const counts = new Map();
  for (const m of text.matchAll(/'(@deepseek-ai\/[^']+)':\s*'([^']+)'/g)) {
    pins.set(m[1], m[2]);
    counts.set(m[2], (counts.get(m[2]) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const [kernelVersion, kernelCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (counts.size > 1) {
    gate.info(`profile-template 里有 ${counts.size} 个不同的 pin 版本，内核版本取多数值 ${kernelVersion}（${kernelCount} 处）；其余按包名各自取 pin`);
  }
  return {
    pins,
    kernelVersion,
    override: process.env.SSID_KERNEL_VERSION ?? null,
    source: 'shell/profile-template/pnpm-workspace.yaml',
  };
}

/**
 * 把 semver range 拆成 OR 分支（`||` 分隔），每支再拆成若干比较器。
 * 覆盖面按实际插件 peerDeps 的形式来：`^0.1.0-rc.6`、`~0.1.3`、精确版本、
 * `>=0.1.1-rc.2 <0.1.2 || >=0.1.2-alpha.1 <0.2.0`（ds-harness-remote 的写法）。
 */
function parseBranch(branch) {
  return branch.split(/\s+/).filter(Boolean).map((token) => {
    const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token);
    return { op: m[1] ?? '=', version: m[2] };
  });
}

/**
 * `^X.Y.Z` → [X.Y.Z, major>0 ? (X+1).0.0-0 : 0.(Y+1).0-0)。
 *
 * 上界必须带 `-0`。npm semver 把 caret 展开成 `>=0.1.7-rc.2 <0.2.0-0`，而写成
 * `<0.2.0` 会把 `0.2.0-rc.1` 也算进覆盖（prerelease 恒小于同号 release）—— 于是
 * 本门对 `^0.1.x` 形式的范围**一律误判为覆盖**。2026-09-29 实测：造 `^0.1.1-rc.1`
 * 的话料喂进本门，判「通过」；而同一个范围在真 semver（7.7.4）下对 0.2.0-rc.1 是
 * false，内核的 `semver.satisfies`（`packages/boot/app-boot/src/plugin-compatibility.ts:77`）
 * 据此把插件静默跳过。差的就是这个 `-0`。
 */
function caretCovers(target, base) {
  const b = parseVersion(base);
  if (b === null) return null;
  const upper = b.major > 0 ? `${b.major + 1}.0.0-0` : `0.${b.minor + 1}.0-0`;
  const lo = compareVersions(target, base);
  const hi = compareVersions(target, upper);
  if (lo === null || hi === null) return null;
  return lo >= 0 && hi < 0;
}

/** `~X.Y.Z` → [X.Y.Z, X.Y+1.0-0)。上界同样要带 `-0`，理由见 caretCovers。 */
function tildeCovers(target, base) {
  const b = parseVersion(base);
  if (b === null) return null;
  const upper = `${b.major}.${b.minor + 1}.0-0`;
  const lo = compareVersions(target, base);
  const hi = compareVersions(target, upper);
  if (lo === null || hi === null) return null;
  return lo >= 0 && hi < 0;
}

/** 单个比较器是否满足；判不了返回 null。 */
function satisfiesOne(target, { op, version }) {
  if (op === '^') return caretCovers(target, version);
  if (op === '~') return tildeCovers(target, version);
  const cmp = compareVersions(target, version);
  if (cmp === null) return null;
  switch (op) {
    case '=': return cmp === 0;
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    default: return null;
  }
}

/**
 * range 是否覆盖 target。任一 OR 分支全部满足即覆盖；判不了的支跳过。
 * @returns true / false / null（后者表示整个 range 都判不了）
 */
function covers(target, range) {
  const branches = String(range).split('||').map((s) => s.trim()).filter(Boolean);
  if (branches.length === 0) return null;
  let judged = false;
  for (const branch of branches) {
    const results = parseBranch(branch).map((c) => satisfiesOne(target, c));
    if (results.some((r) => r === null)) continue;
    judged = true;
    if (results.every(Boolean)) return true;
  }
  return judged ? false : null;
}

const targets = readTargets();
if (targets === null) {
  gate.violation(path.join(SHELL, 'profile-template', 'pnpm-workspace.yaml'), null, '取不到目标版本表（文件缺失或无 @deepseek-ai/* pin）');
} else {
  const kernelLabel = targets.override ?? targets.kernelVersion;
  gate.info(`目标内核版本 ${kernelLabel}（${targets.override === null ? targets.source : 'SSID_KERNEL_VERSION'}）；其余 @deepseek-ai/* 按包名各自取 pin，表里没有的不判`);

  // 第三处是工作区里的插件源码 `max-null-plugins/` —— 它不在本仓库内，却正是最容易
  // 漏的一类：`@max-null/*` 随 SSiD 出厂，而 peer 由各自仓库维护，内核一升 minor
  // 就集体不兼容，可它们一个都不住在 plugins/ 或 vendor/ 里。目录不存在时走下面的
  // 「跳过（不存在）」，不报错（换台机器只有 SSiD 仓库时仍可跑）。
  const WORKSPACE = path.resolve(REPO, '..');
  const roots = process.env.SSID_PLUGIN_DIRS
    ? process.env.SSID_PLUGIN_DIRS.split(path.delimiter).filter(Boolean)
    : [
      path.join(REPO, 'plugins'),
      path.join(SHELL, 'profile-template', 'vendor'),
      path.join(WORKSPACE, 'max-null-plugins'),
    ];

  for (const root of roots) {
    if (!fs.existsSync(root)) { gate.info(`跳过（不存在）：${path.relative(REPO, root)}`); continue; }
    // walk 按 endsWith 匹配**文件名**，不能带路径分隔符
    const manifests = walk(root, { exts: ['package.json'], skipDirs: ['node_modules', '.git'] });
    for (const manifest of manifests) {
      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      } catch (cause) {
        gate.violation(manifest, null, `package.json 解析失败：${cause.message}`);
        continue;
      }
      const peers = pkg.peerDependencies ?? {};
      const dshPeers = Object.entries(peers).filter(([name]) => name.startsWith('@deepseek-ai/'));
      if (dshPeers.length === 0) continue;
      gate.inspect();
      for (const [name, range] of dshPeers) {
        // 先按**内核自己的命名空间**分诊：`plugin-compatibility.ts:75` 只筛
        // `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*`，`cordis` / `cosmokit` /
        // `schemastery` / `cordis-plugin-*` 根本不在它的检查面内 —— 它们各有自己的
        // 版本线（cordis 是 4.x），拿内核版本去套只会制造假违规。
        const isKernelFamily = name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-');
        if (!isKernelFamily) {
          gate.info(`不判（不在内核校验命名空间内）：${name}`);
          continue;
        }
        // 命名空间内的包跟着内核版本走：优先取它自己的 pin，表里没有就回退内核版本
        // —— `dsh-client-ui-primitives` / `dsh-host-apiproxy` 这类就不在那 212 条
        // pin 里，但它们确实是内核的一部分，必须按内核版本判。
        const target = targets.override ?? targets.pins.get(name) ?? targets.kernelVersion;
        const verdict = covers(target, range);
        if (verdict === false) {
          gate.violation(
            manifest, null,
            `${pkg.name ?? path.basename(path.dirname(manifest))} 的 ${name}@${range} 不覆盖 ${name} 的目标版本 ${target}`,
          );
        } else if (verdict === null) {
          // 判不了就报出来而不是放行：静默通过会让门失去意义
          gate.info(`判不了（跳过）：${pkg.name} 的 ${name}@${range}`);
        }
      }
    }
  }
}

process.exit(gate.done());
