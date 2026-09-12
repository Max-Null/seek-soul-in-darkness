#!/usr/bin/env node
/**
 * sync-vendor —— 把 plugins 源同步到各 vendor 份（待办 #1）
 *
 * 与 check-vendor-sync **互为对偶**：一个同步、一个验证，共用 lib/vendor-fingerprint.mjs
 * 的比对面与指纹实现 —— 两边各写一份就会出现「验证说通过、同步完却仍不一致」。
 *
 * 只处理 manifest 里 `mode: "full"` 且有真实 source 的包（当前是 dsh-ssid-panels 与
 * dsh-ssid-zh-ui）。`vendor-only` 的包源头在 SSiD 仓库之外或不存在，本脚本不碰，
 * 那类一致性由 check-vendor-sync 的三处互比负责。
 *
 * ── 三个安全默认（均为本次决策，非上游既有约定）────────────────────
 * 1. **默认 dry-run**：只报告不写盘，必须显式 `--apply`。
 * 2. **默认不同步 web**：`~/.dsh/profiles/web` 是当前会话的宿主实例，改它等于动运行中的
 *    环境（工作区铁律 2）。需要时用 `--web` 显式开启，且该参数会在输出里显著标注。
 * 3. **默认不删除多余文件**：vendor 侧多出的文件只在报告里列出，要真删需 `--prune`。
 *    理由是不可逆 —— profile 下的 vendor 没有 git 保护（tpl 侧有），删错无法回滚。
 *
 * 用法：
 *   node scripts/sync-vendor.mjs                  # dry-run，报告差异
 *   node scripts/sync-vendor.mjs --apply          # 真正写入（仍不删多余文件）
 *   node scripts/sync-vendor.mjs --apply --prune  # 连多余文件一并删除
 *   node scripts/sync-vendor.mjs --web            # 把 web 也纳入目标（慎用）
 *   node scripts/sync-vendor.mjs --pkg=dsh-ssid-zh-ui
 *
 * 退出码：dry-run 有差异 → 1（便于脚本判断）；无差异 → 0；--apply 成功后 → 0。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSpec, fingerprint, diff } from './lib/vendor-fingerprint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const MANIFEST = path.join(HERE, 'check-rules.manifest.json');

const APPLY = process.argv.includes('--apply');
const PRUNE = process.argv.includes('--prune');
const INCLUDE_WEB = process.argv.includes('--web');
const ONLY = (process.argv.find((a) => a.startsWith('--pkg=')) ?? '').slice(6);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const copies = manifest.vendorCopies ?? {};

const targets = [['tpl', copies.tpl]];
if (INCLUDE_WEB) targets.push(['web', copies.web]);
targets.push(['ssid', copies.ssid]);

const short = (p) => p.replace(/^[A-Z]:\\Users\\[^\\]+\\/, '~/').replace(/\\/g, '/');

console.log(`\n  sync-vendor · ${APPLY ? '写入模式' : 'dry-run（加 --apply 才写盘）'}`);
console.log(`  目标：${targets.map(([l]) => l).join(' + ')}${INCLUDE_WEB ? '  ⚠ 含 web（当前会话宿主实例）' : '（web 未纳入；需要时加 --web）'}`);
console.log(`  删除多余文件：${PRUNE ? '开启（--prune）' : '关闭（--prune 才执行）'}`);
if (!APPLY) console.log('  本次只报告差异，不修改任何文件。');

const syncable = Object.entries(manifest.packages ?? {})
  .filter(([pkg, spec]) => spec.mode === 'full' && spec.source && (!ONLY || pkg === ONLY));

if (syncable.length === 0) {
  console.log(`\n  没有可同步的包${ONLY ? `（--pkg=${ONLY} 未匹配）` : ''}\n`);
  process.exit(0);
}

let changedTotal = 0;
let failed = 0;

for (const [pkg, spec] of syncable) {
  const srcDir = resolveSpec(spec.source, REPO);
  const base = fingerprint(srcDir, spec);
  if (!base) {
    console.log(`\n  ✗ ${pkg}：源头不存在（${spec.source}）`);
    failed++;
    continue;
  }
  console.log(`\n  ── ${pkg}  ← 源 ${spec.source}（${base.size} 文件）`);

  for (const [label, relRoot] of targets) {
    const tDir = path.join(resolveSpec(relRoot, REPO), pkg);
    const cur = fingerprint(tDir, spec);
    if (!cur) { console.log(`    [${label}] ✗ 目标不存在：${short(tDir)}`); failed++; continue; }

    const d = diff(base, cur);
    const n = d.toCopy.length + d.toOverwrite.length + d.toDelete.length;
    if (n === 0) { console.log(`    [${label}] ✓ 一致（${cur.size} 文件）`); continue; }
    changedTotal += n;

    console.log(`    [${label}] ${short(tDir)}`);
    for (const f of d.toCopy) console.log(`        + 新增 ${f}`);
    for (const f of d.toOverwrite) console.log(`        ↑ 覆盖 ${f}`);
    for (const f of d.toDelete) console.log(`        - 多余 ${f}${PRUNE ? '' : '（需 --prune）'}`);

    if (!APPLY) continue;
    for (const f of [...d.toCopy, ...d.toOverwrite]) {
      const dst = path.join(tDir, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(srcDir, f), dst);
    }
    if (PRUNE) for (const f of d.toDelete) fs.rmSync(path.join(tDir, f), { force: true });
    console.log(`        → 已写入（复制/覆盖 ${d.toCopy.length + d.toOverwrite.length}${PRUNE ? `，删除 ${d.toDelete.length}` : ''}）`);
  }
}

console.log(`\n  ${'─'.repeat(60)}`);
if (failed) console.log(`  ✗ ${failed} 处失败`);
if (changedTotal === 0) console.log('  ✓ 全部一致，无需同步');
else if (!APPLY) console.log(`  · 共 ${changedTotal} 处差异待同步（dry-run；加 --apply 执行）`);
else console.log(`  ✓ 已同步 ${changedTotal} 处`);
console.log('');
process.exit(!APPLY && changedTotal > 0 ? 1 : failed ? 1 : 0);
