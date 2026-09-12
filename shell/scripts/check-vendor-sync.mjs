#!/usr/bin/env node
/**
 * check-vendor-sync —— vendor 各份一致性（待办 #5、手册 §10 的硬性要求，骨架建议 §3.1）
 *
 * 比对面（最多四份）：
 *   1. 源（在 SSiD 仓库内或仓库外，按 manifest 声明）
 *   2. shell/profile-template/vendor/<pkg>   发版基准
 *   3. ~/.dsh/profiles/web/vendor/<pkg>      运行时（web）
 *   4. ~/.dsh/profiles/ssid/vendor/<pkg>     运行时（ssid）
 *
 * 三条设计约束（都来自实测，不是推断）：
 *
 *   a. **比对面必须逐包声明**。dsh-quick-toolbar 的 vendor 是精简副本（只收 lib/、
 *      cordis.patch.yml、package.json），源侧 43 文件对 vendor 4 文件——直接比"整目录摘要"
 *      会报 40 处差异而其中只有 1 处是真信号。所以按包分 full / vendor-only 两种模式。
 *
 *   b. **不引入记录式哈希**。官方 .i18n.yaml 记录"上次确认一致时的 blob 哈希"，是因为
 *      双语对两侧内容本就不同、没有可比第二份。这里的各份**应当完全相同**，直接实时比对；
 *      若引入记录文件，它自己就变成又一个需要同步的东西。
 *
 *   c. **哈希对象是文件集合，不是目录**。逐文件建「相对路径 → 指纹」映射再比，
 *      差异分三类输出（未同步 / 多余 / 漂移）。只在源侧存在与内容漂移是两种处置，
 *      压成一个"目录不一致"就没法定位了。
 *
 * 指纹与比对面的实现在 `lib/vendor-fingerprint.mjs`，**与 sync-vendor 共用同一份** ——
 * 两边各写一份就会出现「验证说通过、同步完却仍不一致」这类自相矛盾，而防那类事故正是
 * 本门存在的理由。手册习惯叫"MD5"，文档与错误信息统一写「指纹」，实现用 sha256。
 *
 * 退出码：0 通过 / 1 有差异 / 2 空语料。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createGate } from './lib/gate-report.mjs';
import { resolveSpec, fingerprint, firstDiffLine } from './lib/vendor-fingerprint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const MANIFEST = path.join(HERE, 'check-rules.manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const gate = createGate({ id: 'check-vendor-sync', label: 'vendor 各份一致性', base: REPO });

const copies = manifest.vendorCopies ?? {};

for (const [pkg, spec] of Object.entries(manifest.packages ?? {})) {
  if (spec.$unmanaged) {
    gate.info(`跳过（manifest 登记为不受管）：${pkg} —— ${String(spec.$unmanagedReason ?? '').slice(0, 60)}…`);
    continue;
  }
  const onlyProfiles = spec.profiles;   // 例如 dsh-dream-skin 只在 web

  const sides = [['tpl', path.join(resolveSpec(copies.tpl, REPO), pkg)]];
  for (const name of ['web', 'ssid']) {
    if (onlyProfiles && !onlyProfiles.includes(name)) continue;
    sides.push([name, path.join(resolveSpec(copies[name], REPO), pkg)]);
  }

  const maps = {};
  for (const [label, dir] of sides) maps[label] = fingerprint(dir, spec);

  let sourceMap = null, sourceLabel = '';
  if (spec.mode === 'full' && spec.source) {
    const dir = resolveSpec(spec.source, REPO);
    sourceMap = fingerprint(dir, spec);
    sourceLabel = 'src';
    if (sourceMap === null) {
      gate.inspect();
      gate.violation(dir, null, `manifest 声明的源头不存在：${spec.source}`);
      continue;
    }
  }

  // 比对面 = 源（若有）+ 所有 vendor 份
  const all = sourceMap ? [['src', sourceMap], ...Object.entries(maps)] : Object.entries(maps);
  const present = all.filter(([, m]) => m !== null);
  const missingSides = all.filter(([, m]) => m === null).map(([l]) => l);

  gate.inspect();
  gate.info(`${pkg}（${spec.mode}）：${present.map(([l, m]) => `${l}=${m.size}`).join('  ')}${missingSides.length ? `  缺=${missingSides.join(',')}` : ''}`);

  if (present.length < 2) {
    gate.violation(present[0]?.[0] ?? pkg, null, `${pkg}：可比的份数不足 2（${present.length}），无法比对`);
    continue;
  }

  // 以第一份为基准（full 模式即源侧）
  const [baseLabel, baseMap] = present[0];
  for (const [label, m] of present.slice(1)) {
    for (const [rel, h] of baseMap) {
      gate.inspect();
      if (!m.has(rel)) {
        gate.violation(path.join(REPO, rel), null, `${pkg}/${rel}  只在 ${baseLabel} 侧存在（${label} 缺该文件）→ 未同步`);
      } else if (m.get(rel) !== h) {
        const srcRoot = resolveSpec(spec.source ?? copies.tpl, REPO);
        const ln = firstDiffLine(path.join(srcRoot, pkg, rel), path.join(resolveSpec(copies[label], REPO), pkg, rel));
        gate.violation(path.join(REPO, rel), ln, `${pkg}/${rel}  ${baseLabel} 与 ${label} 内容漂移（指纹 ${h.slice(0, 8)} vs ${m.get(rel).slice(0, 8)}）`);
      }
    }
    for (const rel of m.keys()) {
      gate.inspect();
      if (!baseMap.has(rel)) {
        gate.violation(path.join(REPO, rel), null, `${pkg}/${rel}  只在 ${label} 侧存在（${baseLabel} 无此文件）→ 多余文件`);
      }
    }
  }
}

process.exit(gate.done());
