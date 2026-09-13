/**
 * check-loader-external 的自测（骨架纪律：每 gate 一个自测）
 *
 * 纪律同其它门：自测演练**门本身**（SSID_BUNDLE_DIR 注入临时目录，跑真实脚本）、
 * 占用临时目录的用例自己收尾、断言精确到违规定位与受检数。
 *
 * `node --test scripts/check-loader-external.spec.mjs` 直接可跑。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-loader-external.mjs');

/** 跑真实门脚本，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, SSID_BUNDLE_DIR: dir, NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssid-loader-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 写一个 package.json，构建脚本按参数决定是否带 external。 */
function writePkg(dir, { withExternal = true } = {}) {
  const ext = withExternal ? ' --external:@deepseek-ai/*' : '';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'tmp-shell',
    scripts: {
      'bundle-kernel': `esbuild kernel.ts --bundle${ext} --outfile=kernel.bundle.mjs`,
      'bundle-kernel-child': `esbuild kernel-child.ts --bundle${ext} --outfile=kernel-child.bundle.mjs`,
    },
  }, null, 2));
}

test('正确配置（脚本带 external、产物小且无 include 实现）→ 退出码 0', () => {
  withTempDir((dir) => {
    writePkg(dir);
    fs.writeFileSync(path.join(dir, 'kernel.bundle.mjs'), 'import { boot } from "@deepseek-ai/dsh-app-boot";\nexport const x = 1;\n');
    fs.writeFileSync(path.join(dir, 'kernel-child.bundle.mjs'), 'import { boot } from "@deepseek-ai/dsh-app-boot";\n');
    const r = runGate(dir);
    assert.equal(r.code, 0, `期望 0，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /✓ 通过：0 处违规/);
    assert.match(r.out, /受检 4 个/, '两个脚本 + 两个产物');
  });
});

test('构建脚本缺 --external:@deepseek-ai/* → 退出码 1，且指名是哪个脚本', () => {
  withTempDir((dir) => {
    writePkg(dir, { withExternal: false });
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /bundle-kernel 缺少 --external:@deepseek-ai\/\*/);
    assert.match(r.out, /bundle-kernel-child 缺少 --external:@deepseek-ai\/\*/);
    assert.match(r.out, /package\.json/, '要定位到文件');
  });
});

test('产物内联了 include → 退出码 1，且点出特征串（本次 405 的形状）', () => {
  withTempDir((dir) => {
    writePkg(dir);
    fs.writeFileSync(path.join(dir, 'kernel.bundle.mjs'), 'function applyEntryPatches(){}\nfunction composeEntries(){}\n');
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /applyEntryPatches/);
    assert.match(r.out, /composeEntries/);
    assert.match(r.out, /kernel\.bundle\.mjs/);
  });
});

test('产物体积超标 → 退出码 1，且给出正确值参考', () => {
  withTempDir((dir) => {
    writePkg(dir);
    fs.writeFileSync(path.join(dir, 'kernel-child.bundle.mjs'), 'x'.repeat(80 * 1024));
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /体积 80\.0 KB 超过上限 64 KB/);
    assert.match(r.out, /正确值约 21 KB/, '要给出参照，否则读者不知道差多远');
  });
});

test('产物未构建不算违规（日常可能没构建），但脚本那项仍受检 → 不空语料', () => {
  withTempDir((dir) => {
    writePkg(dir);
    const r = runGate(dir);
    assert.equal(r.code, 0, `只有脚本可判时也应通过\n${r.out}`);
    assert.match(r.out, /受检 2 个/, '两个脚本，产物被跳过');
    assert.match(r.out, /跳过（未构建）/);
  });
});

test('package.json 缺失 → 退出码 1（而不是静默通过）', () => {
  withTempDir((dir) => {
    const r = runGate(dir);
    assert.equal(r.code, 1, `期望 1，实际 ${r.code}\n${r.out}`);
    assert.match(r.out, /找不到 package\.json/);
  });
});
