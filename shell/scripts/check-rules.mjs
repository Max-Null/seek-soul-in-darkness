#!/usr/bin/env node
/**
 * check-rules —— 四项规范检查的编排器（待办 #5，骨架建议 §4）
 *
 * 只做四件事（官方 run-gates.ts 那 1583 行里被 SSiD 用得上的一小部分）：
 *   1. 单入口 + 白名单 mode 校验。非法值抛错并**回显全部合法值**。
 *   2. 门表数据化，命令与展示名分离（`{ id, label, script }`）。
 *   3. 顺序执行 + 逐门计时 + 输出缓冲。
 *   4. 退出码契约：**任一失败 ⇒ exit 1**。
 *
 * 明确不抄的部分及理由（骨架 §5）：needs/after 双依赖与环检测（四门之间无产物依赖）、
 * 手写并发调度（四门串行秒级完成，官方封顶 4 是被多个 doc 门各建整棵 ts.Program 逼出来的）、
 * fail-fast 进程树终止（SSiD 的门读完文件就退出、不留后代）、十余个 DSH_* 开关（配置面即理解成本）。
 *
 * 失败输出按官方 `formatGateResultReason` 把三类事实**全列出、互不遮蔽**：
 * error / exit N / signal X —— 只报"失败"而不说清是哪一类，会让人查错方向。
 *
 * 用法：node scripts/check-rules.mjs [all|vendor-sync|profile-sync|bom|legacy-names]
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MODES = [
  { id: 'vendor-sync', label: 'vendor 各份一致性', script: 'check-vendor-sync.mjs' },
  { id: 'profile-sync', label: 'profile 与 template 声明对比', script: 'check-profile-sync.mjs' },
  { id: 'bom', label: 'BOM 扫描', script: 'check-bom.mjs' },
  { id: 'legacy-names', label: '旧名残留（硬域）', script: 'check-legacy-names.mjs' },
];

const README = `用法: node scripts/check-rules.mjs [${['all', ...MODES.map((m) => m.id)].join('|')}]

  all            依次跑全部门（默认）
${MODES.map((m) => `  ${m.id.padEnd(14)} ${m.label}`).join('\n')}`;

const arg = process.argv[2] ?? 'all';
const valid = ['all', ...MODES.map((m) => m.id)];
if (!valid.includes(arg)) {
  console.error(`✗ 未知 mode：「${arg}」\n\n${README}\n`);
  process.exit(2);
}

const picked = arg === 'all' ? MODES : MODES.filter((m) => m.id === arg);

console.log(`  check-rules · 共 ${picked.length} 门${arg === 'all' ? '（全部）' : `（仅 ${arg}）`}`);

const results = [];
for (const m of picked) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, m.script)], { encoding: 'utf8' });
  const ms = Date.now() - t0;
  // 门自己已经打印了带定位的明细，这里只补一行计时与结论
  process.stdout.write(r.stdout ?? '');
  if (r.stderr) process.stderr.write(r.stderr);
  results.push({ ...m, code: r.status, signal: r.signal, err: r.error, ms });
}

const failed = results.filter((r) => r.code !== 0);

console.log(`\n  ${'═'.repeat(64)}`);
console.log('  汇总');
console.log(`  ${'─'.repeat(64)}`);
for (const r of results) {
  const mark = r.code === 0 ? '✓' : '✗';
  const cost = `${r.ms} ms`;
  console.log(`  ${mark} ${r.id.padEnd(14)} ${String(r.label).padEnd(26)} ${cost.padStart(8)}`);
}
if (failed.length) {
  console.log(`\n  未通过 ${failed.length} 门：`);
  for (const r of failed) {
    // 三类事实全列出、互不遮蔽
    const facts = [];
    if (r.err) facts.push(`error=${r.err.code ?? r.err.message}`);
    facts.push(`exit ${r.code === null ? 'null' : r.code}`);
    if (r.signal) facts.push(`signal ${r.signal}`);
    console.log(`    · ${r.id}  [${facts.join(' | ')}]`);
  }
  console.log(`\n  ✗ 共 ${failed.length}/${results.length} 门未通过\n`);
  process.exit(1);
}
console.log(`\n  ✓ 全部 ${results.length} 门通过\n`);
