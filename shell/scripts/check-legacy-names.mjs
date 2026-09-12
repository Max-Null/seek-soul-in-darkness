#!/usr/bin/env node
/**
 * check-legacy-names —— 旧名残留（待办 #5，骨架建议 §3.4）
 *
 * **这一项最容易做错。** 全仓 grep `header-unify` 实测命中 79 处，绝大多数在
 * `docs/决策/**` 与 `docs/release-notes-*.md` 里，是合法的历史叙述（"原 dsh-header-unify"）。
 * 用黑名单式全仓文本扫描，79 条噪声会立刻摧毁这条规则的可信度。
 *
 * 判据（骨架 §3.5）：门禁回答「**这样写会不会坏**」，不回答「这样写是否够新」。
 * 所以只查**引用会不会失效**：
 *
 *   硬域（旧名在这里会导致运行失败，必须为零）
 *     - profile 声明的 dependencies 键 与 dsh.profile.bundles 项
 *     - cordis.patch.yml 里各条目的 id / name
 *     - plugins/ 与 vendor/ 下的目录名
 *
 *   软域（旧名在这里只是历史，豁免）
 *     - docs/决策/、docs/release-notes-*、代码注释里的「（原 X）」叙述
 *
 * 硬域一律**结构化解析后等值匹配**，不做文本扫描 —— 子串匹配会把
 * `dsh-quick-toolbar-old-name` 之类误判，也会漏掉真正的键值失配。
 *
 * 退出码：0 通过 / 1 有旧名 / 2 空语料。
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
const MANIFEST = path.join(HERE, 'check-rules.manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const gate = createGate({ id: 'check-legacy-names', label: '旧名残留（硬域）', base: REPO });

/** 归一化：去掉 @scope/ 前缀、统一分隔符与大小写，再比。旧名有多个变体。 */
const norm = (s) => String(s).replace(/^@[^/]+\//, '').replace(/[_.]/g, '-').toLowerCase();

const renames = manifest.renames ?? [];
const legacy = new Map(renames.map((r) => [norm(r.from), r]));
if (legacy.size === 0) {
  console.error('\n  ✗ manifest 里没有 renames 表，无法检查\n');
  process.exit(2);
}
gate.info(`改名表 ${renames.length} 条：${renames.map((r) => `${r.from} → ${r.to}`).join('; ')}`);

/** 检查一个「结构化值」是否命中旧名。 */
const checkValue = (value, file, line, where) => {
  gate.inspect();
  const r = legacy.get(norm(value));
  if (r) {
    gate.violation(file, line, `${where} 用了旧名「${value}」—— 已于 ${r.at} 改名为「${r.to}」，此处会导致解析/加载失败`);
  }
};

// ── 硬域 1：profile 声明（template + 每个 profile） ──
const profileManifests = [path.join(SHELL, 'profile-template', 'package.json')];
const profilesDir = path.join(DSH_HOME, 'profiles');
if (fs.existsSync(profilesDir)) {
  for (const d of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (d.isDirectory()) profileManifests.push(path.join(profilesDir, d.name, 'package.json'));
  }
}
for (const f of profileManifests) {
  if (!fs.existsSync(f)) continue;
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { gate.violation(f, null, 'JSON 解析失败'); continue; }
  // 行号定位：从原文里找该键出现的那一行
  const raw = fs.readFileSync(f, 'utf8').split('\n');
  const lineOf = (s) => { const i = raw.findIndex((l) => l.includes(`"${s}"`)); return i >= 0 ? i + 1 : null; };
  for (const k of Object.keys(j.dependencies ?? {})) checkValue(k, f, lineOf(k), 'dependencies 键');
  for (const b of j.dsh?.profile?.bundles ?? []) checkValue(b, f, lineOf(b), 'dsh.profile.bundles 项');
}

// ── 硬域 2：cordis.patch.yml 的 id / name ──
const ymls = [];
const collect = (root, depth = 0) => {
  if (!fs.existsSync(root) || depth > 3) return;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) collect(p, depth + 1);
    else if (e.name === 'cordis.patch.yml') ymls.push(p);
  }
};
collect(path.join(SHELL, 'profile-template'));
collect(profilesDir);
collect(path.join(REPO, 'plugins'));
for (const f of ymls) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const m = l.match(/^\s*-?\s*(id|name)\s*:\s*['"]?([^'"\s#]+)['"]?\s*$/);
    if (m) checkValue(m[2], f, i + 1, `cordis.patch.yml 的 ${m[1]}`);
  });
}

// ── 硬域 3：plugins/ 与 vendor/ 下的目录名 ──
const dirs = [];
for (const root of [path.join(REPO, 'plugins'), path.join(SHELL, 'profile-template', 'vendor')]) {
  if (!fs.existsSync(root)) continue;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) dirs.push(path.join(root, e.name));
}
for (const p of [profilesDir]) {
  if (!fs.existsSync(p)) continue;
  for (const d of fs.readdirSync(p, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const v = path.join(p, d.name, 'vendor');
    if (!fs.existsSync(v)) continue;
    for (const e of fs.readdirSync(v, { withFileTypes: true })) if (e.isDirectory()) dirs.push(path.join(v, e.name));
  }
}
for (const d of dirs) checkValue(path.basename(d), d, null, '目录名');

gate.info(`扫描：profile 清单 ${profileManifests.filter((f) => fs.existsSync(f)).length} 个、cordis.patch.yml ${ymls.length} 个、目录名 ${dirs.length} 个`);
gate.info(`软域（豁免，不做文本扫描）：${(manifest.exemptPathPrefixes ?? []).join('、')}`);

process.exit(gate.done());
