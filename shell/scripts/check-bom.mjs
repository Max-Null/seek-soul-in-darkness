#!/usr/bin/env node
/**
 * check-bom —— BOM 扫描（待办 #5 第二项，骨架建议 §3.3）
 *
 * 判定：文件前三字节为 `EF BB BF`。
 *
 * 为什么值得一个门：手册 §4 记过实测故障 —— PowerShell 5.1 的
 * `Set-Content -Encoding UTF8` 会写 BOM，而 `readProfileManifest` 直接崩。
 * 故障面大（一次误写就让内核起不来）、检查成本极低（读三个字节）。
 *
 * 官方 `scripts/` 下没有任何 BOM 检查，这项是自写；结构沿官方风格：
 * Buffer 前三字节判定 + 空语料 fail-loud。
 *
 * 退出码：0 通过 / 1 有 BOM / 2 空语料。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createGate, walk, hasBom } from './lib/gate-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');

const EXTS = ['.json', '.yml', '.yaml'];
// 只看被 node 直接读的文本；构建产物与依赖树不在管辖内
const SKIP_DIRS = ['node_modules', 'build', 'dist', 'dist-electron', 'out', 'lib', '.git'];

const gate = createGate({ id: 'check-bom', label: 'BOM 扫描', base: REPO });

const DEFAULT_TARGETS = [
  { root: path.join(SHELL, 'profile-template'), recursive: true, label: 'shell/profile-template' },
  { root: path.join(SHELL, 'scripts'), recursive: true, label: 'shell/scripts' },
  { root: SHELL, recursive: false, label: 'shell 顶层' },
  { root: path.join(REPO, 'plugins'), recursive: true, label: 'plugins/' },
  { root: path.join(DSH_HOME, 'profiles', 'ssid'), recursive: false, label: 'profile:ssid' },
  { root: path.join(DSH_HOME, 'profiles', 'web'), recursive: false, label: 'profile:web' },
];

// 自测用 SSID_BOM_TARGETS 注入临时目录（path.delimiter 分隔）。
// 这样自测演练的是**门本身**，而不是它的一个副本 —— 否则测过的东西和跑的东西不是一回事。
const TARGETS = process.env.SSID_BOM_TARGETS
  ? process.env.SSID_BOM_TARGETS.split(path.delimiter).filter(Boolean).map((p) => ({ root: p, recursive: true, label: p }))
  : DEFAULT_TARGETS;

for (const t of TARGETS) {
  if (!fs.existsSync(t.root)) {
    gate.info(`跳过（不存在）：${t.label}`);
    continue;
  }
  const files = t.recursive
    ? walk(t.root, { exts: EXTS, skipDirs: SKIP_DIRS })
    : fs.readdirSync(t.root).filter((f) => EXTS.some((x) => f.endsWith(x))).map((f) => path.join(t.root, f));

  for (const f of files) {
    gate.inspect();
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch (e) {
      gate.violation(f, null, `读取失败：${e.code ?? e.message}`);
      continue;
    }
    if (hasBom(buf)) {
      gate.violation(f, 1, '以 UTF-8 BOM (EF BB BF) 开头 —— node 侧 JSON.parse/readFileSync 会崩（PowerShell 5.1 Set-Content -Encoding UTF8 是常见成因）');
    }
  }
  gate.info(`${t.label}：${files.length} 个`);
}

process.exit(gate.done());
