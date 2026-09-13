#!/usr/bin/env node
/**
 * verify-shipped-kernel —— 逐层核对「装进去的那份内核」确实是本次构建的产物
 *
 * 为什么需要它（2026-09-14 v0.3.0 的 405 故障）：
 * `kernel*.bundle.mjs` 不入 git，靠 `extraResources` 从仓库根进包。于是交付链上有
 * **三个各自独立的落点**，任何一层滞后都会让用户装到旧内核，而 dev 走 tsx 直跑源码
 * 所以完全不复现：
 *
 *   1. 仓库根产物          `shell/kernel-child.bundle.mjs`
 *   2. electron-builder 落点 `shell/dist-electron/win-unpacked/resources/…`
 *   3. NSIS 安装包内部      `setup.exe` 里的 `$PLUGINSDIR/app-64.7z` → `resources/…`
 *
 * `check-loader-external` 门覆盖第 1、2 层（判「是否内联 DSH」）；本脚本补第 3 层，
 * 并核对三层**哈希一致**。只判「内容合不合法」不足以发现「装的是上一版产物」——
 * 旧产物本身完全合法，这也是这次漏掉它的原因：查了合法性，没查一致性。
 *
 * 用法：node scripts/verify-shipped-kernel.mjs [--exe <path>]
 * 退出码：0 三层一致 / 1 不一致或缺失 / 2 前提不足（未打包、无 7z）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const DIST = path.join(SHELL, 'dist-electron');
const NAME = 'kernel-child.bundle.mjs';
const REL_IN_PACK = `resources/${NAME}`;

/** 找 7z：环境变量优先，其次常见安装位置。 */
function find7z() {
  const env = process.env.SSID_7Z;
  if (env && fs.existsSync(env)) return env;
  for (const p of [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    '/usr/bin/7z', '/usr/local/bin/7z',
  ]) if (fs.existsSync(p)) return p;
  return undefined;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const problems = [];
const notes = [];
let checked = 0;

// ── 第 1 层：仓库根产物 ─────────────────────────────────────────────────────
const repoBundle = path.join(SHELL, NAME);
if (!fs.existsSync(repoBundle)) {
  console.error(`前提不足：仓库根没有 ${NAME}。先跑 npm run bundle-kernel-child。`);
  process.exit(2);
}
const repoHash = sha256(repoBundle);
const repoSize = fs.statSync(repoBundle).size;
checked++;
notes.push(`仓库根产物        ${String(repoSize).padStart(9)} B  ${repoHash.slice(0, 16)}`);
if (fs.readFileSync(repoBundle, 'utf8').includes('applyEntryPatches')) {
  problems.push(`仓库根产物内联了 DSH（出现 applyEntryPatches）—— 应先跑 npm run bundle-kernel-child`);
}

// ── 第 2 层：electron-builder 落点 ──────────────────────────────────────────
const unpacked = path.join(DIST, 'win-unpacked', REL_IN_PACK);
if (fs.existsSync(unpacked)) {
  const h = sha256(unpacked);
  const s = fs.statSync(unpacked).size;
  checked++;
  notes.push(`win-unpacked 落点 ${String(s).padStart(9)} B  ${h.slice(0, 16)}`);
  if (h !== repoHash) {
    problems.push(`win-unpacked 落点与仓库根产物不一致（${s} B vs ${repoSize} B）—— 打包时沿用了旧产物`);
  }
} else {
  notes.push('win-unpacked 落点  跳过（未打包）');
}

// ── 第 3 层：安装包内部 ─────────────────────────────────────────────────────
const exeArg = process.argv.indexOf('--exe');
const exe = exeArg !== -1
  ? process.argv[exeArg + 1]
  : fs.existsSync(DIST)
    ? fs.readdirSync(DIST).filter(f => /^ssid-shell-setup-.*\.exe$/.test(f)).sort().pop()
      ?.replace(/^/, DIST + path.sep)
    : undefined;

if (!exe || !fs.existsSync(exe)) {
  notes.push('安装包            跳过（未找到 setup.exe）');
} else if (!find7z()) {
  notes.push('安装包            跳过（未找到 7z；可用 SSID_7Z 指定）');
} else {
  const sz = find7z();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-verify-'));
  try {
    // 两层解包：NSIS 安装器 → `$PLUGINSDIR/app-64.7z` → `resources/<bundle>`。
    // 不能一步到位：7z 不会穿透 exe 内嵌的归档去按路径取文件（实测直接取会空手）。
    const s1 = path.join(tmp, 's1');
    execFileSync(sz, ['e', exe, `-o${s1}`, '$PLUGINSDIR/app-64.7z', '-y'], { stdio: 'ignore' });
    const inner = fs.existsSync(s1)
      ? fs.readdirSync(s1).find(f => f.endsWith('.7z'))
      : undefined;
    if (!inner) {
      problems.push('安装包内找不到 $PLUGINSDIR/app-64.7z —— 安装器结构可能已变，需人工确认');
    } else {
      execFileSync(sz, ['e', path.join(s1, inner), `-o${tmp}`, REL_IN_PACK, '-y'], { stdio: 'ignore' });
    }

    const hit = path.join(tmp, NAME);
    if (!fs.existsSync(hit)) {
      problems.push(`安装包内找不到 ${REL_IN_PACK}（7z 未提取到）`);
    } else {
      const h = sha256(hit);
      const s = fs.statSync(hit).size;
      checked++;
      notes.push(`安装包内          ${String(s).padStart(9)} B  ${h.slice(0, 16)}`);
      if (h !== repoHash) {
        problems.push(`安装包内的内核与仓库根产物不一致（${s} B vs ${repoSize} B）`
          + ` —— 装上去的就是旧内核，用户拿到的不是本次构建`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── 报告 ────────────────────────────────────────────────────────────────────
console.log('\n  ══ verify-shipped-kernel · 内核产物逐层一致性\n');
for (const n of notes) console.log('  ' + n);
console.log('');
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n  ✗ 失败：${problems.length} 处问题（受检 ${checked} 层）\n`);
  process.exit(1);
}
if (checked < 2) {
  console.log(`  受检 ${checked} 层：不足以判断交付一致性（需要至少两层可比）\n`);
  process.exit(2);
}
console.log(`  ✓ 三层一致：${checked} 层受检，哈希与仓库根产物相同\n`);
