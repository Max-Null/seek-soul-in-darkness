/**
 * check-cot-leakage 的自测 —— 这份自测的**第一要务是校准**。
 *
 * recall-batteries.md 的纪律（第 11 行）：
 *   > 一个零命中的模式什么都证明不了，直到它命中一个已知正例；
 *   > 一个嘈杂的模式什么都证明不了，直到它拒绝一个近失负例。
 *
 * 所以这里既有正例（证明探针在工作），也有**近失负例**（证明它绑定了完整短语而不乱咬）：
 * `\bthis PR\b` 必须命中 `this PR adds`，但**不能**命中 `this project` / `this process` /
 * `this provider` —— 后者是 recall-batteries 第 10 条点名的边界。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-cot-leakage.mjs');

function run(roots, extraArgs = []) {
  try {
    const out = execFileSync(process.execPath, [GATE, ...extraArgs], {
      env: { ...process.env, SSID_COT_ROOTS: roots, NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function withCorpus(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-cot-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('校准正例：含变更叙事/评审措辞的代码必须命中', () => {
  withCorpus({
    'leaky.mjs': [
      '// 第一版是这么实现的',
      '// 按评审意见改成了现在的写法',
      '// 大概应该够了，回头再说',
      'export const x = 1;',
    ].join('\n'),
  }, (dir) => {
    const r = run(dir);
    assert.equal(r.code, 0, '报告型默认不该阻塞');
    assert.match(r.out, /leaky\.mjs:1/, '要带 文件:行 定位');
    assert.match(r.out, /合计 \d+ 处候选/);
    const n = Number(r.out.match(/合计 (\d+) 处候选/)[1]);
    assert.ok(n >= 3, `三行泄漏措辞至少命中 3 处，实际 ${n}`);
  });
});

test('近失负例：this project / this process / this provider 不该被 \\bthis PR\\b 命中', () => {
  withCorpus({
    'near-miss.mjs': [
      '// this project is small',
      '// this process never exits',
      '// this provider is used',
      '// this PR adds a gate',
    ].join('\n'),
  }, (dir) => {
    const r = run(dir);
    const m = r.out.match(/\[英文探针\]\s+(\d+) 处/);
    assert.ok(m, '英文探针组应出现（因为有 1 处真命中）');
    assert.equal(Number(m[1]), 1, `只有 this PR 那行该命中，实际 ${m[1]} 行`);
  });
});

test('干净代码 → 0 处候选', () => {
  withCorpus({
    'clean.mjs': [
      '/**',
      ' * 计算两个数的和。',
      ' * @param {number} a',
      ' * @param {number} b',
      ' */',
      'export const add = (a, b) => a + b;',
    ].join('\n'),
  }, (dir) => {
    const r = run(dir);
    assert.equal(r.code, 0);
    assert.match(r.out, /合计 0 处候选/);
    assert.match(r.out, /零命中/, '零命中时必须提示校准纪律，免得被当成"没问题"');
  });
});

test('--strict：有候选退 1，无候选退 0', () => {
  withCorpus({ 'a.mjs': '// 第一版这样写\n' }, (dir) => {
    assert.equal(run(dir, ['--strict']).code, 1, 'strict 下有命中应退出 1');
  });
  withCorpus({ 'b.mjs': 'export const ok = true;\n' }, (dir) => {
    assert.equal(run(dir, ['--strict']).code, 0, 'strict 下无命中应退出 0');
  });
});

test('扫描范围不含 .md（.md 里的变更叙事是合法主场）', () => {
  withCorpus({
    'README.md': '# 第一版说明\n\n本版改成了新写法。\n',
    'code.mjs': 'export const ok = true;\n',
  }, (dir) => {
    const r = run(dir);
    assert.match(r.out, /合计 0 处候选/, '.md 不该被扫描');
  });
});
