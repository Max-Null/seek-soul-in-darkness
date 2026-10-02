/**
 * check-profile-manifest 的自测（骨架纪律：每 gate 一个自测）
 *
 * 纪律（同 check-bom.spec.mjs）：
 *   - 自测演练**门本身**，不是它的副本 ⇒ 通过 SSID_PROFILE_MANIFEST_ROOTS 注入临时目录，跑真实脚本
 *   - 占用临时目录的用例**自己收尾**（mkdtempSync + finally rmSync）
 *   - 断言**精确**的定位（文件:行）与判据关键词，不只断言"失败了"
 *
 * 语料按事故的形状造：profile 目录 + 根 package.json + cordis.patch.yml（含一条本地文件条目）。
 * 2026-10-02 事故的现场形态见 `docs/决策/2026-10-02-请求扩展准备失败-本地插件条目打死模型请求.md`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-profile-manifest.mjs');

/** 跑真实门脚本，返回 { code, out }。 */
function runGate(rootDir) {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, SSID_PROFILE_MANIFEST_ROOTS: rootDir, NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-profile-manifest-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 造一份 profile 目录：根 manifest（可指定 version）+ 可选补丁。 */
function makeProfile(dir, { version, patch } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { name: 'dsh-profile-ssid', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } };
  if (version !== undefined) manifest.version = version;
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
  if (patch !== undefined) fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), patch);
}

/** 事故现场的那条条目形状。 */
const PATCH_WITH_LOCAL = [
  '# 临时一次性插件',
  '- insert:',
  '    - id: tmp-ws-registry-fix',
  "      name: 'C:/somewhere/else/plugin-dir/tmp-ws-fix.mjs'",
  '',
].join('\n');

test('干净语料（根 manifest 有 version、补丁只有裸包名）→ 退出码 0', () => {
  withTempDir((dir) => {
    makeProfile(dir, {
      version: '0.0.0',
      patch: ['- insert:', '    - id: mcp-email', "      name: '@deepseek-ai/dsh-mcp-client'", ''].join('\n'),
    });
    const r = runGate(dir);
    assert.equal(r.code, 0, `期望 0，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /✓ 通过/);
    assert.match(r.out, /version=0\.0\.0/);
  });
});

test('根 manifest 缺 version → 退出码 1，定位到 package.json', () => {
  withTempDir((dir) => {
    makeProfile(dir, {});
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /package\.json/, '违规必须定位到出问题的 manifest');
    assert.match(r.out, /缺少非空 version/);
  });
});

test('本地文件条目落在无 version 的祖先 manifest 下 → 退出码 1，定位到补丁的行', () => {
  withTempDir((dir) => {
    // 祖先目录有一份「有 name 无 version」的 manifest —— 事故的机制面。
    const ancestor = path.join(dir, 'plugin-dir');
    fs.mkdirSync(ancestor, { recursive: true });
    fs.writeFileSync(
      path.join(ancestor, 'package.json'),
      `${JSON.stringify({ name: 'some-host-project', private: true }, undefined, 2)}\n`,
    );
    const profileDir = path.join(dir, 'profile');
    makeProfile(profileDir, { version: '0.0.0', patch: PATCH_WITH_LOCAL.replace('C:/somewhere/else', ancestor.replaceAll('\\', '/')) });
    const r = runGate(profileDir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /cordis\.patch\.yml:4/, '违规必须定位到补丁里的条目行');
    assert.match(r.out, /最近祖先 manifest/);
  });
});

test('同一个祖先 manifest 补上 version 后，同一条目转为通过（证明判据就是它）', () => {
  withTempDir((dir) => {
    const ancestor = path.join(dir, 'plugin-dir');
    fs.mkdirSync(ancestor, { recursive: true });
    fs.writeFileSync(
      path.join(ancestor, 'package.json'),
      `${JSON.stringify({ name: 'some-host-project', version: '0.0.0', private: true }, undefined, 2)}\n`,
    );
    const profileDir = path.join(dir, 'profile');
    makeProfile(profileDir, { version: '0.0.0', patch: PATCH_WITH_LOCAL.replace('C:/somewhere/else', ancestor.replaceAll('\\', '/')) });
    const r = runGate(profileDir);
    assert.equal(r.code, 0, `补上 version 后应通过\n${r.out}`);
  });
});

test('本地条目没有祖先 manifest → 不算违规（内核按非包模块排除）', () => {
  withTempDir((dir) => {
    makeProfile(dir, { version: '0.0.0', patch: PATCH_WITH_LOCAL });
    const r = runGate(dir);
    assert.equal(r.code, 0, `无祖先 manifest 不该报违规\n${r.out}`);
    assert.match(r.out, /无祖先 manifest/);
  });
});

test('空语料 → fail-loud（退出码 2，不是假绿）', () => {
  withTempDir((dir) => {
    const r = runGate(path.join(dir, 'nope'));
    assert.equal(r.code, 2, `空语料必须非零，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /空语料/);
  });
});

test('manifest 不是合法 JSON → 记违规而不是崩栈', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');
    const r = runGate(dir);
    assert.equal(r.code, 1, `坏 JSON 应是一处违规\n${r.out}`);
    assert.match(r.out, /JSON 解析失败/);
  });
});
