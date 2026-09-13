/**
 * check-plugin-peers 的自测（骨架纪律：每 gate 一个自测）
 *
 * 纪律同其它门：自测演练**门本身**（SSID_PLUGIN_DIRS + SSID_KERNEL_VERSION
 * 注入临时语料，跑真实脚本）、自己收尾、断言精确到违规定位。
 *
 * 本文件里最重要的一条是「includePrerelease 不可省」——内核与插件都跑在 rc
 * 版本上，semver 默认的 prerelease 规则会把 `^0.1.0-rc.6` 判成不覆盖
 * `0.1.5-rc.2`（真实存在的组合），从而把好插件误报成坏插件。
 *
 * `node --test scripts/check-plugin-peers.spec.mjs` 直接可跑。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-plugin-peers.mjs');
const KERNEL = '0.1.5-rc.2';

/** 跑真实门脚本，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, SSID_PLUGIN_DIRS: dir, SSID_KERNEL_VERSION: KERNEL, NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-peers-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 在 dir 下建一个插件包，peers 为 null 时不写 peerDependencies。 */
function writePlugin(dir, name, peers) {
  const p = path.join(dir, name);
  fs.mkdirSync(p, { recursive: true });
  const pkg = { name, version: '1.0.0' };
  if (peers !== null) pkg.peerDependencies = peers;
  fs.writeFileSync(path.join(p, 'package.json'), JSON.stringify(pkg, null, 2));
}

test('^0.1.0-rc.6 覆盖 0.1.5-rc.2 → 退出码 0（真实案例：dsh-ssid-panels 0.1.9）', () => {
  withTempDir((dir) => {
    writePlugin(dir, 'dsh-ssid-panels', { '@deepseek-ai/dsh-session': '^0.1.0-rc.6', cordis: '^4.0.0-rc.7' });
    const r = runGate(dir);
    assert.equal(r.code, 0, `范围覆盖内核就该通过\n${r.out}`);
    assert.match(r.out, /✓ 通过：0 处违规/);
    assert.match(r.out, /受检 1 个/);
  });
});

test('includePrerelease 不可省：rc 内核配 rc 范围必须判为覆盖', () => {
  withTempDir((dir) => {
    // 没有 includePrerelease 时，semver 会因 prerelease 规则判 false —— 这条断言锁住那个决定
    writePlugin(dir, 'p-rc', { '@deepseek-ai/dsh-session': '^0.1.0-rc.6' });
    writePlugin(dir, 'p-exact-rc', { '@deepseek-ai/dsh-tools': '0.1.5-rc.2' });
    const r = runGate(dir);
    assert.equal(r.code, 0, `rc 对 rc 不该误报\n${r.out}`);
    assert.match(r.out, /受检 2 个/);
  });
});

test('范围不覆盖内核 → 退出码 1，且报出包名、范围与内核版本', () => {
  withTempDir((dir) => {
    writePlugin(dir, 'p-old', { '@deepseek-ai/dsh-session': '^0.0.9' });
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /p-old 的 @deepseek-ai\/dsh-session@\^0\.0\.9 不覆盖内核 0\.1\.5-rc\.2/);
  });
});

test('~0.1.4 与 ~0.1.3 都覆盖 0.1.5-rc.2 —— ~ 是 >=X.Y.Z <X.Y+1.0，且 prerelease 小于同号正式版', () => {
  withTempDir((dir) => {
    // 探针实测（node probe）：~0.1.3 → [0.1.3, 0.2.0)，0.1.5-rc.2 落在其中。
    // 这条锁住 ~ 的语义，避免把它误当成 [0.1.3, 0.1.4)。
    writePlugin(dir, 'p-tilde4', { '@deepseek-ai/dsh-agent': '~0.1.4' });
    writePlugin(dir, 'p-tilde3', { '@deepseek-ai/dsh-tools': '~0.1.3' });
    const r = runGate(dir);
    assert.equal(r.code, 0, `~0.1.x 都应覆盖 0.1.5-rc.2\n${r.out}`);
    assert.match(r.out, /受检 2 个/);
  });
});

test('精确 0.1.3 不覆盖 0.1.5-rc.2 → 退出码 1', () => {
  withTempDir((dir) => {
    writePlugin(dir, 'p-exact-old', { '@deepseek-ai/dsh-agent': '0.1.3' });
    const r = runGate(dir);
    assert.equal(r.code, 1, `精确 0.1.3 只等于 0.1.3，不覆盖\n${r.out}`);
    assert.match(r.out, /p-exact-old/);
  });
});

test('未声明任何 @deepseek-ai/* peerDep 的包不计入受检（避免噪声）', () => {
  withTempDir((dir) => {
    writePlugin(dir, 'p-no-dsh', { react: '^18.0.0' });
    writePlugin(dir, 'p-none', null);
    writePlugin(dir, 'p-has', { '@deepseek-ai/dsh-session': '^0.1.0' });
    const r = runGate(dir);
    assert.equal(r.code, 0, `只有 p-has 该被受检\n${r.out}`);
    assert.match(r.out, /受检 1 个/, '只统计声明了 DSH peer 的包');
  });
});

test('空语料（没有包声明 DSH peer）→ fail-loud（退出码 2）', () => {
  withTempDir((dir) => {
    writePlugin(dir, 'p-no-dsh', { react: '^18.0.0' });
    const r = runGate(dir);
    assert.equal(r.code, 2, `空语料必须非零，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /空语料/);
  });
});
