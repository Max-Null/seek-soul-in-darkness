/**
 * vendor-fingerprint —— vendor 比对面的共享实现
 *
 * 为什么独立成库：`check-vendor-sync`（验证）与 `sync-vendor`（同步）**必须用同一套规则**。
 * 若各写一份，就会出现「验证说通过、同步完却仍不一致」这类自相矛盾的结果 —— 而这正是
 * 需要一个门来防的那类事故。骨架建议 §8 说"前两项先各自独立"，指的是 vendor-sync 与
 * profile-sync 两块**职责**不同；而同步与验证是同一件事的两面，共享是对的。
 *
 * 规则要点（来自骨架 §3.1）：
 *   - 哈希对象是**文件集合**不是目录：逐文件建「相对路径 → 指纹」映射
 *   - 指纹用 sha256（手册习惯叫 MD5，文档与错误信息统一写「指纹」）
 *   - 比对面按包声明 include/exclude；整目录摘要比对会在精简副本上报大量假差异
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/** manifest 里的路径写法 → 绝对路径（支持 ~ 与相对 SSiD 仓库）。 */
export function resolveSpec(p, REPO) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1).replace(/^[\\/]/, ''));
  return path.resolve(REPO, p);
}

/** 极简 glob：manifest 只用到 `**`、`dir/**`、`*.ext`、精确路径四种形式。 */
export function globToRe(p) {
  if (p === '**') return /^.*$/;
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if ('.+^$()[]{}|\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

export function matchAny(rel, patterns, defaultVal) {
  if (!patterns) return defaultVal;
  return patterns.some((p) => globToRe(p).test(rel));
}

/**
 * 归一化行尾：CRLF 与孤立 CR 都折成 LF。**只对可解码的 UTF-8 文本生效** ——
 * 含 NUL 或非 UTF-8 字节的缓冲区原样返回（二进制不做文本解释）。
 *
 * 为什么要归一：指纹比的是「这份 vendor 与源是不是同一份东西」，而 vendor 各份的落盘路径
 * 不同 —— 源与 template 是 git 检出（`core.autocrlf=true` 下为 CRLF），profile 里
 * `file:./vendor/<pkg>` 的实体则由 **pnpm 物化**（行尾归一成 LF）。行尾码不是内容：
 * 它既不进 JS/YAML 的语义，也不是任何人手改出来的，却被字节哈希放大成「漂移」。
 * 实测（2026-09-18 v0.3.3 发版）：`check-vendor-sync` 报的 6 处违规全是行尾码之差，
 * 内容逐份全等；且每次 `pnpm install` 都会把这个差异造回来 —— 门若对此敏感，
 * 它报的就是一个永远修不干净的假信号，真漂移反而淹没在里面。
 *
 * 代价：源侧行尾被手工改写而内容不变时不再报漂移。这是有意的取舍 —— 行尾对插件运行无影响，
 * 而不报这一点换来的是一条**能长期维持**的门。
 */
export function normalizeEol(buf) {
  if (buf.includes(0)) return buf;
  const text = buf.toString('utf8');
  if (text.includes('\uFFFD')) return buf;   // 非法 UTF-8 序列 → 按二进制处理
  return Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8');
}

/** 逐文件建「相对路径 → sha256」映射；目录不存在返回 null。 */
export function fingerprint(dir, spec) {
  const out = new Map();
  if (!dir || !fs.existsSync(dir)) return null;
  const include = spec.include ?? ['**'];
  const exclude = spec.exclude ?? [];
  (function visit(d, rel) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (matchAny(childRel, exclude, false) || matchAny(childRel + '/', exclude, false) || matchAny(childRel + '/x', exclude, false)) continue;
        visit(full, childRel);
      } else if (e.isFile()) {
        if (!matchAny(childRel, include, true)) continue;
        if (matchAny(childRel, exclude, false)) continue;
        out.set(childRel, crypto.createHash('sha256').update(normalizeEol(fs.readFileSync(full))).digest('hex'));
      }
    }
  })(dir, '');
  return out;
}

/** 文本文件报第一处不同的行号；二进制或过大返回 null。 */
export function firstDiffLine(fa, fb) {
  try {
    const a = fs.readFileSync(fa), b = fs.readFileSync(fb);
    if (a.includes(0) || b.includes(0) || a.length > 2 * 1024 * 1024) return null;
    const la = a.toString('utf8').split('\n');
    const lb = b.toString('utf8').split('\n');
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) return i + 1;
    }
    return null;
  } catch { return null; }
}

/** 两份指纹映射的差异：{ toCopy, toDelete, toOverwrite }。base 为源侧。 */
export function diff(base, target) {
  const toCopy = [], toDelete = [], toOverwrite = [];
  for (const rel of base.keys()) {
    if (!target.has(rel)) toCopy.push(rel);
    else if (target.get(rel) !== base.get(rel)) toOverwrite.push(rel);
  }
  for (const rel of target.keys()) if (!base.has(rel)) toDelete.push(rel);
  return { toCopy: toCopy.sort(), toDelete: toDelete.sort(), toOverwrite: toOverwrite.sort() };
}
