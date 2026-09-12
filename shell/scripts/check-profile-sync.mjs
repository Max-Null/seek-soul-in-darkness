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
  gate.info(`B[${prof}] dependencies ${Object.keys(bDeps).length} 个（含内核族 ${Object.keys(bDeps).filter(isKernel).length} 个，已排除）`);

  // ── 判定 1/2/3：依赖集的方向性差异与版本失配 ──
  const names = [...new Set([...Object.keys(aDeps), ...Object.keys(bDeps)])].filter((n) => !isKernel(n)).sort();
  for (const n of names) {
    gate.inspect();
    const inA = n in aDeps, inB = n in bDeps;
    if (inA && !inB) {
      gate.violation(bpPath, null, `「${n}」只在 A 有：B 尚未声明，部署后会自动补上（可预期的稳态，未必需要动手）`);
    } else if (!inA && inB) {
      if (exemptOnlyInB[n]) {
        gate.info(`豁免（manifest 已登记的临时态）：「${n}」只在 B 有 —— ${exemptOnlyInB[n]}`);
      } else {
        gate.violation(bpPath, null, `「${n}」只在 B 有 ⚠ B 超前于 A —— 下次部署会被归档包覆盖，必须补进 profile-template（铁律 5 双处声明）`);
      }
    } else if (aDeps[n] !== bDeps[n]) {
      gate.violation(bpPath, null, `「${n}」版本失配：A=${aDeps[n]}  B=${bDeps[n]}`);
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
}

process.exit(gate.done());
