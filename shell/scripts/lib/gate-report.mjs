/**
 * gate-report —— 所有 check-* 门共用的报告契约
 *
 * 契约（来自 2026-09-10 骨架建议 §4/§8）：
 *   1. 每条违规自带 `文件:行` 定位 —— 没有定位的报告等于没跑
 *   2. 失败输出把三类事实全列出、互不遮蔽：违规数 / 受检语料数 / 退出码
 *   3. 发现问题 ⇒ **非零退出**（明确避开 verify-deploy-rename.mjs 那种「打 [FAIL] 仍 exit 0」的形状）
 *   4. 空语料 **fail-loud** —— 一个什么都没扫到的门用 0 退出码是假绿
 *
 * 用法：
 *   const gate = createGate({ id: 'check-bom', label: 'BOM 扫描' });
 *   gate.inspect();                        // 记一个受检文件
 *   gate.violation(file, 1, '以 BOM 开头');  // 记一条违规
 *   process.exit(gate.done());             // 打印汇总并取退出码
 */
import fs from 'node:fs';
import path from 'node:path';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
};

const NO_COLOR = process.env.NO_COLOR != null || !process.stdout.isTTY;
const c = NO_COLOR ? { dim: (s) => s, red: (s) => s, green: (s) => s } : C;

export function createGate({ id, label, base = process.cwd() }) {
  const violations = [];
  const infos = [];
  let inspected = 0;

  const rel = (p) => {
    const r = path.relative(base, p);
    return r && !r.startsWith('..') ? r : p;
  };

  return {
    /** 记一个受检对象（文件/条目）。用于 fail-loud 判定。 */
    inspect(n = 1) { inspected += n; },

    /** 记一条违规。line 为 null 时只报文件级定位。 */
    violation(file, line, message) {
      violations.push({ file: rel(file), line: line ?? null, message });
    },

    /** 记一条中性信息（不算违规）。 */
    info(text) { infos.push(text); },

    get inspectedCount() { return inspected; },
    get violationCount() { return violations.length; },

    /** 打印汇总并返回退出码（0 通过 / 1 有违规 / 2 空语料）。 */
    done() {
      const n = violations.length;
      console.log(`\n  ${c.dim('══')} ${id} · ${label}`);
      for (const t of infos) console.log(`  ${c.dim(t)}`);

      if (inspected === 0) {
        console.log(`  ${c.red('✗ 空语料')}：受检 0 个 —— 路径可能拼错，按纪律 fail-loud（不返回假绿）`);
        return 2;
      }
      console.log(`  ${c.dim(`受检 ${inspected} 个`)}`);

      if (n === 0) {
        console.log(`  ${c.green('✓ 通过')}：0 处违规`);
        return 0;
      }
      for (const v of violations) {
        console.log(`  ${c.red('✗')} ${v.line == null ? v.file : `${v.file}:${v.line}`}  ${v.message}`);
      }
      console.log(`  ${c.red('✗ 失败')}：${n} 处违规 / 受检 ${inspected} 个`);
      return 1;
    },
  };
}

/**
 * 递归列出文件。
 * @param {string} root
 * @param {{exts?: string[], skipDirs?: string[], skipNames?: string[]}} opts
 */
export function walk(root, { exts = null, skipDirs = [], skipNames = [] } = {}) {
  const skipD = new Set(skipDirs);
  const skipN = new Set(skipNames);
  const out = [];
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skipD.has(e.name)) continue;
        visit(p);
      } else if (e.isFile()) {
        if (skipN.has(e.name)) continue;
        if (!exts || exts.some((x) => e.name.endsWith(x))) out.push(p);
      }
    }
  };
  visit(root);
  return out.sort();
}

/** 文件前三字节是否为 UTF-8 BOM。 */
export function hasBom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/** 报告里统一的「指纹」措辞（手册习惯叫 MD5，实现用 sha256）。 */
export const FINGERPRINT_ALGO = 'sha256';
