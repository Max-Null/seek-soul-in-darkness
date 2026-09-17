/**
 * check-vendor-sync 的自测 —— vendor 各份一致性的判定语义。
 *
 * 为什么不逐字节比 env：门本身读运行环境（`~/.dsh/profiles/{web,ssid}`），而门「算出什么」
 * 由共用的 `lib/vendor-fingerprint.mjs` 决定。本文件只测那个**纯函数**，用临时目录造语料、
 * 不写任何 profile、不依赖机器状态。
 *
 * 这里守住的是一条**实测逼出来的**判定规则：指纹只对文本文件的**行尾码**免疫，其余一律逐字节。
 * 背景（2026-09-18 v0.3.3 发版实测）：仓库开了 `core.autocrlf=true`，源与 template 是 CRLF；
 * 而 profile 里 `file:./vendor/<pkg>` 的实体是 **pnpm 物化**写出来的，它把行尾归一成 LF
 * （实证：`vendor/<pkg>/x` 与 `node_modules/@max-null/<pkg>/x` 字节与时间戳完全相同）。
 * 于是「四份逐文件指纹一致」这条硬性要求在 Windows 上**结构性不可维持** —— 每次
 * `pnpm install` 都会把它打回 LF，与内容是否真的同步无关。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint } from './lib/vendor-fingerprint.mjs';

/** 造一对只差行尾的同内容文件；返回两侧指纹与临时根（调用方负责清理）。 */
function fixture(text, { left, right }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfp-'));
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, 'f'), text.replace(/\n/g, left));
  fs.writeFileSync(path.join(b, 'f'), text.replace(/\n/g, right));
  return { root, a, b };
}

const SPEC = { mode: 'full', include: ['**'] };

test('行尾码不同不算漂移：CRLF 与 LF 的同一份文本指纹相同', (t) => {
  const { root, a, b } = fixture('insert:\n  - id: x\n    name: y\n', { left: '\r\n', right: '\n' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.notEqual(fs.readFileSync(path.join(a, 'f')).length, fs.readFileSync(path.join(b, 'f')).length, '语料本身应当字节数不同');
  assert.equal(fingerprint(a, SPEC).get('f'), fingerprint(b, SPEC).get('f'));
});

test('孤立的 CR（旧 Mac 行尾）同样归一', (t) => {
  const { root, a, b } = fixture('a\nb\n', { left: '\r', right: '\n' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(fingerprint(a, SPEC).get('f'), fingerprint(b, SPEC).get('f'));
});

test('行尾之外的任何差异仍然报漂移（末尾换行、空格、内容）', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (dir, text) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'f'), text);
  };
  write('base', 'a\nb\n');
  write('noFinalNewline', 'a\nb');
  write('trailingSpace', 'a \nb\n');
  write('different', 'a\nc\n');
  const base = fingerprint(path.join(root, 'base'), SPEC).get('f');
  for (const dir of ['noFinalNewline', 'trailingSpace', 'different']) {
    assert.notEqual(fingerprint(path.join(root, dir), SPEC).get('f'), base, `${dir} 必须被判定为漂移`);
  }
});

test('二进制文件的字节被完整计入（行尾归一只作用于可解码的 UTF-8 文本）', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (dir, bytes) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'b.bin'), bytes);
  };
  write('one', Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0xfe]));
  write('two', Buffer.from([0x00, 0x0a, 0xff, 0xfe]));
  assert.notEqual(
    fingerprint(path.join(root, 'one'), SPEC).get('b.bin'),
    fingerprint(path.join(root, 'two'), SPEC).get('b.bin'),
    '含 NUL 的非 UTF-8 字节串不得被行尾归一吞掉差异',
  );
});
