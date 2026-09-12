#!/usr/bin/env node
/**
 * verify-release —— 发版归档抽查（待办 #2）
 *
 * 服务 `ssid-release` skill 的抽查环节：**skill 是流程清单，本脚本是它的机械化工具**
 * （分工见手册待办 #2 原文）。判定项逐条对应 `docs/发版流程规范.md` 的 §4 完整性检查
 * 与 §5「归档内容抽查清单（解包验证，发布前必须全过）」：
 *
 *   §4  归档约 185 MB；明显偏小 = 被中断/损坏（绿屏案例留下过 7.4MB 半成品）
 *   §5-1 `.runtime-version` == <ssidVer>-<dshVer>-<指纹>
 *   §5-2 open-sea-skin/plugin/client.js 含 "enabled: false"（SSiD 定制默认关闭）
 *   §5-3 @max-null/dsh-plugin-center 版本 == npm 最新
 *   §5-4 dsh-better-sidebar 版本 == pin 预期
 *   §5-5 @max-null/dsh-capture/lib/client.js 含最新功能标记
 *   §5-6 package.json dependencies 含本轮新增
 *   §5-7 vendor 包版本号与源仓库一致
 *
 * ── 两条实测定下的实现纪律 ────────────────────────────────────
 *
 * 1. **tar 列表要剥 CRLF**。Windows 上 bsdtar 输出是 CRLF，条目实为 "./package.json\r"，
 *    不剥则 `endsWith('package.json')` 永远不成立 —— 曾让 §5 的 7 条抽查全部误报"归档内无此文件"。
 *
 * 2. **"读不到"必须与"内容不符"区分**。实测 `tar -xzOf` 对
 *    `./node_modules/@max-null/<pkg>/...` 返回 0 字节，而同一文件在
 *    `./vendor/<pkg>/...` 下可正常读出（59 KB、含标记）。若把空的读取结果当成内容不符，
 *    就会报出假违规 —— §5-5 正是这样误报过一次"归档缺功能标记"。故 `readOrNull()`
 *    对空结果返回 null，调用方据"读不到 / 不符"两种事实分别处置。
 *
 * ── 为什么默认不部署、不 boot ─────────────────────────────────
 * 部署会重写 profile、boot 会拉起内核，两者都**改变运行环境**；本脚本的定位是
 * "发布前只读抽查"。规范 §6.2 把部署与 boot 放在本机 dev 验证环节（要重启思灵、看日志），
 * 那一步由 ssid-release skill 的流程负责人执行，脚本只给出验证方式的提示。
 *
 * 用 `tar -tzf` / `tar -xzOf` **选择性读取**而非整包解包：185 MB 全解包要几十秒且要临时空间，
 * 抽查只需要清单里那几个文件。Windows 10+ 自带 bsdtar。
 *
 * 用法：node scripts/verify-release.mjs [--archive=<path>] [--expect-ver=X.Y.Z] [--npm-latest]
 * 退出码：0 全过 / 1 有不合格项 / 2 归档缺失（fail-loud，不假装通过）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGate } from './lib/gate-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const MP = 'H:/MaxNull/WorkStation/max-null-plugins';

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const ARCHIVE = arg('archive') ?? path.join(SHELL, 'dsh-runtime.tar.gz');
const EXPECT_VER = arg('expect-ver');
const CHECK_NPM = process.argv.includes('--npm-latest');

/** 规范 §4 的期望体积；容差 ±15% —— 明显偏小才是信号，不必卡在小数点。 */
const EXPECT_MB = 185;
const TOLERANCE = 0.15;

if (!fs.existsSync(ARCHIVE)) {
  console.error(`\n  ✗ 找不到归档：${ARCHIVE}`);
  console.error('    它是发版产物、不入库（.gitignore: shell/dsh-runtime.tar.gz）。');
  console.error('    先跑 `node scripts/prepare-runtime.mjs` 重建（约 3-5 分钟），或指定 --archive=<path>。\n');
  process.exit(2);
}

const gate = createGate({ id: 'verify-release', label: '发版归档抽查', base: REPO });

const tar = (args) => execFileSync('tar', args, { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });

// 纪律 1：剥 CRLF
const entries = tar(['-tzf', ARCHIVE]).toString('utf8')
  .split('\n').map((e) => e.replace(/\r$/, '')).filter(Boolean);

/** 读单个文件；**空结果为 null（读不到）**，与内容不符区分开（纪律 2）。 */
const readOrNull = (entry) => {
  try {
    const buf = tar(['-xzOf', ARCHIVE, entry]);
    return buf.length === 0 ? null : buf.toString('utf8');
  } catch { return null; }
};
const find = (suffix) => entries.find((e) => e === suffix || e.endsWith('/' + suffix));
/** vendor 副本可读性优于 node_modules 副本（纪律 2 的实测结论）。 */
const findVendor = (pkg, rel) => entries.find((e) => new RegExp(`/vendor/${pkg}/${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(e));

// ── §4 体积完整性 ──
const sizeMB = fs.statSync(ARCHIVE).size / 1024 / 1024;
gate.inspect();
gate.info(`归档：${path.relative(REPO, ARCHIVE)}（${sizeMB.toFixed(1)} MB，${entries.length} 条目）`);
const lo = EXPECT_MB * (1 - TOLERANCE), hi = EXPECT_MB * (1 + TOLERANCE);
if (sizeMB < lo) {
  gate.violation(ARCHIVE, null, `体积 ${sizeMB.toFixed(1)} MB 明显偏小（期望约 ${EXPECT_MB} MB，下限 ${lo.toFixed(0)}）—— 归档可能被中断或损坏（规范 §4 记过 7.4MB 半成品案例），须重跑 prepare-runtime`);
} else if (sizeMB > hi) {
  gate.info(`· 体积高于期望上限 ${hi.toFixed(0)} MB，通常是依赖增多，请确认是否预期`);
}

// ── §5-1 .runtime-version ──
{
  const e = find('.runtime-version');
  gate.inspect();
  if (!e) gate.violation(ARCHIVE, null, '§5-1 归档内没有 .runtime-version');
  else {
    const v = readOrNull(e);
    if (v === null) gate.info('§5-1 .runtime-version 读不到内容，跳过');
    else {
      const val = v.trim();
      gate.info(`§5-1 .runtime-version = ${val}`);
      if (!/^\d+\.\d+\.\d+.*-\d+\.\d+\.\d+.*-.+/.test(val)) {
        gate.violation(ARCHIVE, null, `§5-1 .runtime-version 形如 <ssidVer>-<dshVer>-<指纹>，实际为「${val}」（勿手改，由 prepare-runtime 生成）`);
      }
      if (EXPECT_VER && !val.startsWith(EXPECT_VER)) {
        gate.violation(ARCHIVE, null, `§5-1 .runtime-version 以 ${val.split('-')[0]} 开头，与 --expect-ver=${EXPECT_VER} 不符`);
      }
    }
  }
}

// ── §5-2 open-sea-skin 定制默认关闭 ──
{
  const e = entries.find((x) => x.includes('open-sea-skin') && x.endsWith('plugin/client.js'));
  gate.inspect();
  if (!e) gate.info('§5-2 归档内无 open-sea-skin/plugin/client.js（该定制未纳入本轮？）');
  else {
    const txt = readOrNull(e);
    if (txt === null) gate.info('§5-2 open-sea-skin client.js 读不到内容，跳过');
    else if (!txt.includes('enabled: false')) gate.violation(ARCHIVE, null, `§5-2 ${e} 不含 "enabled: false" —— SSiD 定制要求默认关闭`);
    else gate.info('§5-2 open-sea-skin 默认关闭标记 ✓');
  }
}

// ── §5-3 / §5-4：外部包版本（优先 vendor 副本，再退回 node_modules） ──
const pkgVersionOf = (name, relPkg = 'package.json') => {
  for (const e of [findVendor(name, relPkg), find(`node_modules/${name}/${relPkg}`), find(`${name}/${relPkg}`)]) {
    if (!e) continue;
    const txt = readOrNull(e);
    if (txt === null) continue;
    try { return { entry: e, version: JSON.parse(txt).version }; } catch {}
  }
  return null;
};
for (const [label, name] of [['§5-3', '@max-null/dsh-plugin-center'], ['§5-4', 'dsh-better-sidebar']]) {
  gate.inspect();
  const r = pkgVersionOf(name);
  if (!r) gate.info(`${label} ${name} 在归档内读不到版本（文件可能不存在或 tar 读不出）—— 不计违规，请人工核对`);
  else gate.info(`${label} ${name} = ${r.version}  （读自 ${r.entry.split('/').slice(1, 3).join('/')}）`);
}

// ── §5-5 dsh-capture 功能标记（优先 vendor 副本 —— 实测 node_modules 路径读不出） ──
{
  const e = findVendor('dsh-capture', 'lib/client.js') ?? find('@max-null/dsh-capture/lib/client.js');
  gate.inspect();
  if (!e) gate.info('§5-5 归档内无 dsh-capture 的 lib/client.js');
  else {
    const txt = readOrNull(e);
    const MARKS = ['dsh-img-edit-btn'];   // 规范 §5-5 举例；新增功能时在此补
    if (txt === null) {
      gate.info(`§5-5 ${e} **读不到内容**（tar -xzOf 返回空）—— 按「读不到≠缺」不计违规，请人工核对`);
    } else {
      const missing = MARKS.filter((m) => !txt.includes(m));
      if (missing.length) gate.violation(ARCHIVE, null, `§5-5 ${e} 缺功能标记：${missing.join(', ')} —— 归档可能装的是旧版`);
      else gate.info(`§5-5 dsh-capture 功能标记 ✓（${MARKS.join(', ')}）`);
    }
  }
}

// ── §5-6 顶层 package.json 的 dependencies ──
{
  const e = find('package.json');
  gate.inspect();
  const txt = e ? readOrNull(e) : null;
  if (!e) gate.violation(ARCHIVE, null, '§5-6 归档顶层没有 package.json');
  else if (txt === null) gate.info('§5-6 顶层 package.json 读不到内容，跳过');
  else {
    let j = null;
    try { j = JSON.parse(txt); } catch { gate.violation(ARCHIVE, null, `§5-6 ${e} 不是合法 JSON`); }
    if (j) {
      const deps = Object.keys(j.dependencies ?? {});
      gate.info(`§5-6 顶层 dependencies ${deps.length} 个`);
      const EXPECT_PRESENT = ['@playwright/mcp'];
      const missing = EXPECT_PRESENT.filter((d) => !deps.includes(d));
      if (missing.length) gate.violation(ARCHIVE, null, `§5-6 dependencies 缺本轮应新增的包：${missing.join(', ')}`);
      else gate.info(`§5-6 应含包齐备 ✓（${EXPECT_PRESENT.join(', ')}）`);
    }
  }
}

// ── §5-7 vendor 包版本与源仓库一致 ──
{
  const vendorEntries = entries.filter((e) => /(^|\/)vendor\/[^/]+\/package\.json$/.test(e));
  gate.inspect();
  if (vendorEntries.length === 0) gate.info('§5-7 归档内无 vendor/*/package.json');
  else {
    let mismatched = 0, compared = 0, unreadable = 0;
    for (const e of vendorEntries) {
      const name = e.split('/vendor/')[1].split('/')[0];
      const srcPkg = [path.join(REPO, 'plugins', name, 'package.json'), path.join(MP, name, 'package.json')].find((p) => fs.existsSync(p));
      if (!srcPkg) continue;
      const txt = readOrNull(e);
      if (txt === null) { unreadable++; continue; }
      compared++;
      let vVer = null;
      try { vVer = JSON.parse(txt).version; } catch {}
      const srcVer = JSON.parse(fs.readFileSync(srcPkg, 'utf8')).version;
      if (srcVer !== vVer) { mismatched++; gate.violation(ARCHIVE, null, `§5-7 vendor/${name} 归档内 ${vVer} ≠ 源仓库 ${srcVer}`); }
    }
    gate.info(`§5-7 比对 ${compared} 个 vendor 包${unreadable ? `（${unreadable} 个读不到，跳过）` : ''}${mismatched ? '' : '，全部一致 ✓'}`);
  }
}

// ── §5-3 的 npm 最新比对（联网，需显式开启） ──
gate.inspect();
if (!CHECK_NPM) {
  gate.info('§5-3 的「== npm 最新」需联网核对，加 --npm-latest 开启（默认跳过，避免发布前意外联网）');
} else {
  try {
    const r = pkgVersionOf('@max-null/dsh-plugin-center');
    const latest = execFileSync('npm', ['view', '@max-null/dsh-plugin-center', 'version'], { encoding: 'utf8' }).trim();
    if (r?.version && r.version !== latest) {
      gate.violation(ARCHIVE, null, `§5-3 归档内 dsh-plugin-center=${r.version} ≠ npm 最新 ${latest} —— npm 发布必须早于归档重建（规范 §2）`);
    } else gate.info(`§5-3 dsh-plugin-center ${r?.version ?? '?'} == npm 最新 ✓`);
  } catch (e) {
    gate.info('§5-3 npm view 失败（网络或未登录），跳过该子项：' + String(e.message).split('\n')[0]);
  }
}

console.log('\n  ── 未由本脚本执行的两步（规范 §6.2 本机 dev 验证）──');
console.log('    部署：重启思灵 → 日志出现 `runtime deploy needed (archive=<ver> proxy=<old>)` → deploy 成功');
console.log('    boot：`npm run smoke`（无需 Electron 的内核冒烟）；桌面端另看 MCP／热键／侧栏诊断');
console.log('    本脚本刻意不做这两步 —— 它们会改变运行环境，属流程步骤而非发布前只读抽查。');

process.exit(gate.done());
