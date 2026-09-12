/**
 * sync-vendor 的自测 —— 只验证**安全默认**，不触发任何写盘。
 *
 * 为什么不测 --apply：它是不可逆的写操作，而 profile 下的 vendor 没有 git 保护。
 * 用一个会真写盘的测试来"证明"它能写盘，代价大于收益；写盘路径靠 dry-run 与
 * check-vendor-sync 的结论互相印证（两者共用 lib/vendor-fingerprint.mjs）来保证。
 * 这里守住的是三条默认里最容易被将来改动破坏的部分。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'sync-vendor.mjs');

function run(args = []) {
  try {
    const out = execFileSync(process.execPath, [GATE, ...args], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

test('安全默认 1：不带 --apply 时不写盘，且明示这一点', () => {
  const r = run();
  assert.match(r.out, /dry-run/);
  assert.match(r.out, /本次只报告差异，不修改任何文件/);
  assert.doesNotMatch(r.out, /→ 已写入/, 'dry-run 绝不能出现"已写入"');
});

test('安全默认 2：默认不把 web 纳入目标，并提示如何开启', () => {
  const r = run();
  assert.match(r.out, /目标：tpl \+ ssid/);
  assert.match(r.out, /web 未纳入；需要时加 --web/);
  assert.doesNotMatch(r.out, /\[web\]/, '默认输出里不该出现 web 目标段');
});

test('安全默认 3：--web 才纳入 web，并在头部显著标注它是宿主实例', () => {
  const r = run(['--web']);
  assert.match(r.out, /含 web（当前会话宿主实例）/);
  assert.match(r.out, /\[web\]/);
});

test('安全默认 4：删除默认关闭，多余文件只标注需 --prune', () => {
  const r = run(['--web']);
  assert.match(r.out, /删除多余文件：关闭（--prune 才执行）/);
  // 若此刻恰好无多余文件，则不该出现任何删除行；有则必须带提示
  const deletes = r.out.split('\n').filter((l) => l.includes('- 多余'));
  for (const l of deletes) assert.match(l, /需 --prune/);
});

test('退出码契约：dry-run 无差异退 0；有差异退 1（便于脚本判断）', () => {
  const noWeb = run();
  const withWeb = run(['--web']);
  // 默认目标当前应是一致状态；若环境变动导致有差异，则必须退 1 而不是静默 0
  assert.equal(noWeb.code, /全部一致/.test(noWeb.out) ? 0 : 1, '无差异应退 0');
  if (/共 \d+ 处差异待同步/.test(withWeb.out)) {
    assert.equal(withWeb.code, 1, 'dry-run 有差异必须退 1');
  }
});
