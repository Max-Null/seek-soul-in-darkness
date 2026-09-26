#!/usr/bin/env node
/**
 * check-profile-sync —— profile 与 template 的插件声明对比（待办 #5，骨架建议 §3.2）
 *
 * 比对面：`shell/profile-template/package.json`（发版基准，A）
 *        对 `~/.dsh/profiles/<name>/package.json`（运行时，B）
 * 取两个字段：`dependencies`（包名 → 版本）与 `dsh.profile.bundles`（数组）。
 *
 * 为什么值得一个门：手册 §4 记过实测 —— **只改 B 不改 A，部署后 B 会被归档包版本覆盖**。
 * 所以「B 落后于 A」是可预期的稳态，「**B 超前于 A**」才是下一次发版会踩的坑。
 * 两个方向都要报，但文案必须区分，否则读者无法判断该不该动手。
 *
 * 构造期排除内核族 `@deepseek-ai/*` 与 `cordis`：dev 源码模式下 profile 声明
 * 不包含内核族（实测 B 有 33 个内核族条目而 A 一个都没有），拿它比必然假红。
 *
 * 退出码：0 通过 / 1 有失配 / 2 空语料。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createGate } from './lib/gate-report.mjs';
// 判定 3 的方向区分复用本仓库自己的 semver 语义（含 pre-release；无法解析返回 null）。
import { compareVersions } from '../lib/profile-merge.mjs';
// 判定 6 复用同一套 patch 解析（顶层条目 / insert 子条目切分），不另写 YAML 解析。
import { splitPatchEntries, splitChildEntries } from '../lib/profile-merge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');

const TEMPLATE_PKG = path.join(SHELL, 'profile-template', 'package.json');
const MANIFEST = path.join(HERE, 'check-rules.manifest.json');

/** 内核族：dev 源码模式下由内核自身提供，不参与比对面。 */
const isKernel = (name) => name.startsWith('@deepseek-ai/') || name === 'cordis';

const gate = createGate({ id: 'check-profile-sync', label: 'profile 与 template 声明对比', base: REPO });

if (!fs.existsSync(TEMPLATE_PKG)) {
  console.error(`\n  ✗ 找不到发版基准：${TEMPLATE_PKG}\n`);
  process.exit(2);
}
const A = JSON.parse(fs.readFileSync(TEMPLATE_PKG, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const profiles = manifest.profiles ?? ['ssid'];
/** 已知临时态白名单（manifest 声明）：命中时降级为 info 但仍然打印，不静默。 */
const exemptOnlyInB = manifest.profileSync?.exemptOnlyInB ?? {};
/**
 * 「A 领先、B 已冻结」白名单：B 侧 profile 不再接受部署时（换壳过渡期里安装版冻结在旧内核，
 * 不会再装新版插件），「B 落后于 A」就不是「一次未完成的部署」而是**稳态** —— 与
 * `exemptOnlyInB` 是同一类豁免的两个方向。理由与撤销条件写在 manifest 里，换壳完成后连同登记一并移除。
 */
const exemptFrozenInB = manifest.profileSync?.exemptFrozenInB ?? {};
/** 所有受检 profile 里实际出现过的非内核依赖名；循环后用来给豁免登记自洁。 */
const seenInB = new Set();

console.log(`  A（发版基准）= ${path.relative(REPO, TEMPLATE_PKG)}`);
console.log(`  B（运行时）  = ${path.join(DSH_HOME, 'profiles', '<name>', 'package.json')}`);
console.log(`  受检 profile：${profiles.join(', ')}（manifest 声明；不存在即报错，不静默跳过）`);

const aDeps = A.dependencies ?? {};
gate.info(`A dependencies ${Object.keys(aDeps).length} 个（含内核族 ${Object.keys(aDeps).filter(isKernel).length} 个，已排除）`);

for (const prof of profiles) {
  const bpPath = path.join(DSH_HOME, 'profiles', prof, 'package.json');
  if (!fs.existsSync(bpPath)) {
    gate.inspect();
    gate.violation(bpPath, null, `manifest 声明的 profile 目录不存在 —— 按纪律报错而非静默跳过`);
    continue;
  }
  const B = JSON.parse(fs.readFileSync(bpPath, 'utf8'));
  const bDeps = B.dependencies ?? {};
  for (const n of Object.keys(bDeps)) if (!isKernel(n)) seenInB.add(n);
  gate.info(`B[${prof}] dependencies ${Object.keys(bDeps).length} 个（含内核族 ${Object.keys(bDeps).filter(isKernel).length} 个，已排除）`);

  // ── 判定 1/2/3：依赖集的方向性差异与版本失配 ──
  const names = [...new Set([...Object.keys(aDeps), ...Object.keys(bDeps)])].filter((n) => !isKernel(n)).sort();
  for (const n of names) {
    gate.inspect();
    const inA = n in aDeps, inB = n in bDeps;
    if (inA && !inB) {
      if (exemptFrozenInB[n]) {
        gate.info(`豁免（manifest 已登记 B 侧冻结）：「${n}」只在 A 有 —— ${exemptFrozenInB[n]}`);
      } else {
        gate.violation(bpPath, null, `「${n}」只在 A 有：B 尚未声明，部署后会自动补上（可预期的稳态，未必需要动手）`);
      }
    } else if (!inA && inB) {
      if (exemptOnlyInB[n]) {
        gate.info(`豁免（manifest 已登记的临时态）：「${n}」只在 B 有 —— ${exemptOnlyInB[n]}`);
      } else {
        gate.violation(bpPath, null, `「${n}」只在 B 有 ⚠ B 超前于 A —— 下次部署会被归档包覆盖，必须补进 profile-template（铁律 5 双处声明）`);
      }
    } else if (aDeps[n] !== bDeps[n]) {
      // 方向区分（本文件开头第 11 行：两个方向都要报，但文案必须区分，否则读者
      // 无法判断该不该动手）。compareVersions 对非 semver 形态（file: / git: 等）
      // 返回 null —— 那类退回中性文案，不假装知道方向。
      const cmp = compareVersions(aDeps[n], bDeps[n]);
      if (cmp === null) {
        gate.violation(bpPath, null, `「${n}」声明不同：A=${aDeps[n]}  B=${bDeps[n]}（非 semver 形态，无法判方向）`);
      } else if (cmp > 0) {
        if (exemptFrozenInB[n]) {
          gate.info(`豁免（manifest 已登记 B 侧冻结）：「${n}」B 落后于 A（A=${aDeps[n]}  B=${bDeps[n]}）—— ${exemptFrozenInB[n]}`);
        } else {
          gate.violation(bpPath, null, `「${n}」版本失配：B 落后于 A（A=${aDeps[n]}  B=${bDeps[n]}）—— 可预期的稳态，部署后会按 A 补上；要立刻拉平就跑 pnpm install`);
        }
      } else {
        gate.violation(bpPath, null, `「${n}」版本失配：⚠ B 超前于 A（A=${aDeps[n]}  B=${bDeps[n]}）—— 下次部署会被归档包覆盖，必须补进 profile-template（铁律 5 双处声明）`);
      }
    }
  }

  // ── 判定 4：bundles 的每一项必须在 dependencies 里（反方向不查：MCP 包本就不注册为 bundle） ──
  for (const [side, pkg, p] of [['A', A, TEMPLATE_PKG], ['B', B, bpPath]]) {
    for (const b of pkg.dsh?.profile?.bundles ?? []) {
      if (isKernel(b)) continue;
      gate.inspect();
      if (!(b in (pkg.dependencies ?? {}))) {
        gate.violation(p, null, `${side} 侧 bundles 里的「${b}」未在 dependencies 中声明`);
      }
    }
  }

  // ── 判定 5（仅 A）：file:./vendor/<X> 指向的目录必须存在 ──
  for (const [n, v] of Object.entries(aDeps)) {
    if (typeof v !== 'string' || !v.startsWith('file:')) continue;
    gate.inspect();
    const target = path.resolve(path.dirname(TEMPLATE_PKG), v.slice(5));
    if (!fs.existsSync(target)) {
      gate.violation(TEMPLATE_PKG, null, `「${n}」指向 ${v}，但该目录不存在`);
    }
  }

  // ── 判定 6：cordis.patch.yml 的条目覆盖（模板 → 运行时）──
  //
  // 为什么需要它：dev 裸跑不部署（main.mjs 的 devSkipDeploy），**模板改了 patch
  // 不会自动流到运行时**。2026-09-21 实测：模板已把 Playwright 拆成无头/有头两条目
  // 并加了 CLI 缺失护栏，本机运行时还是单条、无护栏 —— 而判定 1~5 只看 package.json，
  // 完全看不到这一层（那次是用户凭印象发现的）。
  //
  // 判据（方向：模板有 → 运行时须有；反方向的「本机增量」是正常的，不报）：
  //   a. 模板的条目 id 运行时缺 → 落后。部署时会补上，但**在补齐之前功能就是缺的**
  //      （那一版缺的是「同时开有头+无头浏览器」）。
  //   b. 同 id 条目模板带 disabled、运行时不带 → **护栏缺失**，比 a 更该管：那条
  //      args 一旦求值出 null，dsh-mcp-client 的 schema 拒绝 string[]，整棵插件树
  //      加载失败、内核起不来（见 docs/决策/2026-09-15-MCP条目CLI缺失拖死启动修复.md）。
  const tplPatchPath = path.join(SHELL, 'profile-template', 'cordis.patch.yml');
  const runPatchPath = path.join(DSH_HOME, 'profiles', prof, 'cordis.patch.yml');
  if (fs.existsSync(tplPatchPath) && fs.existsSync(runPatchPath)) {
    /** 收集「条目 id → { disabled }」。insert 块的 id 在子条目上，故两块分别展开。 */
    const collectPatchEntries = (file) => {
      const map = new Map();
      for (const entry of splitPatchEntries(fs.readFileSync(file, 'utf8'))) {
        const first = String(entry.text ?? '').split('\n')[0] ?? '';
        const remember = (id, text) => {
          if (typeof id === 'string' && id.length > 0) map.set(id, { disabled: /^\s+disabled:/m.test(text) });
        };
        if (/^-\s+insert:/.test(first)) {
          for (const child of splitChildEntries(entry.text)) remember(child.id, child.text);
        } else {
          remember(entry.id, entry.text);
        }
      }
      return map;
    };
    const tplEntries = collectPatchEntries(tplPatchPath);
    const runEntries = collectPatchEntries(runPatchPath);
    gate.info(`cordis.patch.yml：模板 ${tplEntries.size} 个条目 id，运行时 ${runEntries.size} 个`);
    for (const [id, meta] of tplEntries) {
      gate.inspect();
      if (!runEntries.has(id)) {
        gate.violation(runPatchPath, null, `patch 条目「${id}」只在模板有：运行时还没同步 —— dev 不部署，得手工搬（判定 6 注释）`);
        continue;
      }
      if (meta.disabled && !runEntries.get(id).disabled) {
        gate.violation(runPatchPath, null, `patch 条目「${id}」缺 disabled 护栏（模板有、运行时没有）⚠ 该条目的 args 一旦求值出 null 会让整棵插件树加载失败、内核起不来`);
      }
    }
  }
}

// 豁免登记自洁：登记的项若在所有受检 profile 里都不再出现，它已经是一条死豁免。
// 「不静默」是这条纪律的两面 —— 命中时要打印，失效时也要，否则白名单只会越积越旧。
for (const [key, exempt] of [['exemptOnlyInB', exemptOnlyInB], ['exemptFrozenInB', exemptFrozenInB]]) {
  for (const name of Object.keys(exempt)) {
    gate.inspect();
    if (!seenInB.has(name)) {
      gate.info(`豁免已过期：「${name}」在所有受检 profile 里都不再出现 —— 可从 manifest 的 profileSync.${key} 移除`);
    }
  }
}

process.exit(gate.done());
