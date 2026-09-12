/**
 * check-bom 的自测（骨架纪律：每 gate 一个自测）
 *
 * 纪律（来自骨架 §8 末尾）：
 *   - 自测演练**门本身**，不是它的副本 ⇒ 通过 SSID_BOM_TARGETS 注入临时目录，跑真实脚本
 *   - 占用临时目录的用例**自己收尾**（mkdtempSync + finally rmSync）
 *   - 断言**精确**的错误定位（文件:行），不只断言"失败了"
 *
 * 官方对应物是 verify-*.spec.ts；这里门是 .mjs，所以自测也是 .mjs，
 * `node --test scripts/check-bom.spec.mjs` 直接可跑，不必引 tsx。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-bom.mjs');

/** 跑真实门脚本，返回 { code, out }。 */
function runGate(targetDir) {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, SSID_BOM_TARGETS: targetDir, NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-bom-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

test('干净语料 → 退出码 0，且报告受检数', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'a.json'), '{"x":1}');
    fs.writeFileSync(path.join(dir, 'b.yml'), 'k: v\n');
    const r = runGate(dir);
    assert.equal(r.code, 0, `期望 0，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /✓ 通过/);
    assert.match(r.out, /受检 2 个/);
  });
});

test('含 BOM 的 JSON → 退出码 1，且定位到 文件:行', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'bad.json'), Buffer.concat([BOM, Buffer.from('{"x":1}')]));
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /bad\.json:1/, '违规必须带 文件:行 定位');
    assert.match(r.out, /EF BB BF/, '错误信息要写清是哪种字节');
  });
});

test('同名干净文件与 BOM 文件并存时只报后者', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'ok.json'), '{"a":1}');
    fs.writeFileSync(path.join(dir, 'ng.yaml'), Buffer.concat([BOM, Buffer.from('a: 1\n')]));
    const r = runGate(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /ng\.yaml:1/);
    assert.doesNotMatch(r.out, /ok\.json:1/);
    assert.match(r.out, /1 处违规 \/ 受检 2 个/, '受检数要含干净文件，否则统计失真');
  });
});

test('空语料 → fail-loud（退出码 2，不是假绿）', () => {
  withTempDir((dir) => {
    const r = runGate(dir);
    assert.equal(r.code, 2, `空语料必须非零，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /空语料/);
  });
});

test('非目标扩展名不计入受检（.md 带 BOM 不报）', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'note.md'), Buffer.concat([BOM, Buffer.from('# t\n')]));
    fs.writeFileSync(path.join(dir, 'a.json'), '{"x":1}');
    const r = runGate(dir);
    assert.equal(r.code, 0, `只有 .md 带 BOM 不该失败\n${r.out}`);
    assert.match(r.out, /受检 1 个/, '只应统计 .json/.yml/.yaml');
  });
});

test('node_modules 下的文件被跳过（不误报依赖树）', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'x.json'), Buffer.concat([BOM, Buffer.from('{}')]));
    fs.writeFileSync(path.join(dir, 'a.json'), '{"x":1}');
    const r = runGate(dir);
    assert.equal(r.code, 0, `node_modules 不应纳入管辖\n${r.out}`);
    assert.match(r.out, /受检 1 个/);
  });
});
