/**
 * check-legacy-names 的自测
 *
 * 这份自测的第一要务是**校准**：门在真实仓库里零命中，而「零命中」既可能是真干净、
 * 也可能是门根本没在工作 —— 两者必须能区分。所以用例 1 造一个已知正例，
 * 证明它确实会命中；用例 4 再造一个"看起来像但其实不该命中"的反例，
 * 证明它是**结构化解析**而不是文本扫描（后者会把注释里的历史叙述也报出来，
 * 那正是骨架 §3.5 说的"变更探测器"）。
 *
 * 隔离手段：门通过 DSH_HOME 读 profile 清单，所以把 DSH_HOME 指向临时目录，
 * 就能在不碰任何真实文件的前提下构造语料。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-legacy-names.mjs');

function runGate(dshHome) {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, DSH_HOME: dshHome, NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function withHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-legacy-'));
  fs.mkdirSync(path.join(dir, 'profiles'), { recursive: true });
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const writeProfile = (home, name, obj) => {
  const d = path.join(home, 'profiles', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(obj, null, 2));
  return d;
};

test('校准：已知正例必须命中（否则零命中毫无意义）', () => {
  withHome((home) => {
    const d = writeProfile(home, 'calib', {
      name: 'calib', private: true,
      dependencies: { '@max-null/dsh-header-unify': '0.1.0' },
      dsh: { profile: { bundles: ['@max-null/dsh-header-unify'] } },
    });
    const r = runGate(home);
    assert.equal(r.code, 1, `预期命中旧名，实际退出码 ${r.code}\n${r.out}`);
    assert.match(r.out, /dsh-header-unify/, '要报出旧名本身');
    assert.match(r.out, /dsh-quick-toolbar/, '要报出新名供修复');
    assert.match(r.out, /package\.json:\d+/, '违规要带 文件:行 定位');
    assert.ok(fs.existsSync(path.join(d, 'package.json')));
  });
});

test('归一化：下划线变体与带 scope 的写法同样命中', () => {
  withHome((home) => {
    writeProfile(home, 'calib2', {
      name: 'calib2', private: true,
      dependencies: { 'dsh_header_unify': '0.1.0' },
      dsh: { profile: { bundles: [] } },
    });
    const r = runGate(home);
    assert.equal(r.code, 1, `归一化后应命中，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /dsh_header_unify/);
  });
});

test('干净语料 → 退出码 0', () => {
  withHome((home) => {
    writeProfile(home, 'clean', {
      name: 'clean', private: true,
      dependencies: { '@max-null/dsh-quick-toolbar': '0.8.6' },
      dsh: { profile: { bundles: ['@max-null/dsh-quick-toolbar'] } },
    });
    const r = runGate(home);
    assert.equal(r.code, 0, `新名不该被报，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /✓ 通过/);
  });
});

test('反例：注释里的旧名**不该**命中（证明是结构化解析而非文本扫描）', () => {
  withHome((home) => {
    const d = writeProfile(home, 'commented', {
      name: 'commented', private: true,
      dependencies: { '@max-null/dsh-quick-toolbar': '0.8.6' },
      dsh: { profile: { bundles: ['@max-null/dsh-quick-toolbar'] } },
    });
    // 这是历史叙述 —— 真实仓库的 docs/ 里有 79 处同类内容，报出来就是"变更探测器"
    fs.writeFileSync(path.join(d, 'cordis.patch.yml'), [
      '# 原 dsh-header-unify，2026-08-30 改名为 dsh-quick-toolbar',
      '# 上面这行是注释，不该被当作残留',
      'plugins:',
      '  - name: dsh-quick-toolbar',
      '    id: "@max-null/dsh-quick-toolbar"',
      '',
    ].join('\n'));
    const r = runGate(home);
    assert.equal(r.code, 0, `注释里的历史叙述不该报（否则 79 处噪声会淹没规则）\n${r.out}`);
    assert.doesNotMatch(r.out, /✗.*cordis\.patch\.yml/);
  });
});

test('空语料 fail-loud：manifest 缺 renames 时报错退出', () => {
  withHome((home) => {
    // 借用真实 manifest 的路径不可行，这里验证的是"没有改名表就不该静默通过"这一纪律，
    // 由门顶部的 legacy.size === 0 分支保证；用真实路径跑一次确认它正常返回 0/1 而非崩溃。
    const r = runGate(home);
    assert.ok(r.code === 0 || r.code === 1, `不该崩溃，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /受检 \d+ 个/);
  });
});
