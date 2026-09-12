#!/usr/bin/env node
/**
 * check-cot-leakage —— CoT 泄漏候选扫描（待办 #8）
 *
 * 探针逐字取自 @max-null/dsh-skills 的 ssid-trim-cot-leakage/references/recall-batteries.md，
 * 未作改写 —— 那套词表与校准纪律是在真实评审里迭代出来的，照抄比"优化"安全。
 *
 * **为什么是报告型而不是门。** 探针集自己第 3 行就说清了：
 *   > 每一个命中都需要语义判断 —— 探针按设计会过度匹配，而按本性又匹配不足。
 * 并且它对自身语料有实测：扫本包 8 份 SKILL.md 命中 24 处，**逐条判断后真泄漏为 0**。
 * 若做成"命中即失败"，它会第一时间误杀自己的校准语料，然后被无视 —— 那才是真的失效。
 * 所以默认**恒以 0 退出**、只给候选；`--strict` 才在命中时退出 1，供收窄范围后的 CI 使用。
 *
 * **扫描范围只取代码**（.ts/.mjs/.cjs/.js），刻意不含任何 .md：
 *   - CoT 泄漏的主要载体是**代码注释**
 *   - 而 .md 里的变更叙事大多是**合法主场**（决策记录、release notes、规范文档都在陈述变更史）
 *   - 实测本仓库 docs/ 下「旧名/不再/曾经」类命中几乎全为合法叙述，纳入只会制造噪声
 *
 * 退出码：默认 0（报告型）；--strict 时有候选则 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..');
const REPO = path.resolve(SHELL, '..');

const STRICT = process.argv.includes('--strict');

/** 逐字取自 recall-batteries.md「中文探针（主探针集）」+「英文探针（保留）」。 */
const PROBES = [
  {
    name: '变更叙事与版本戳',
    flags: 'g',
    src: '第一版|本版|旧版|老的|曾经|原来|不再|以前|之前是|改成了|已改为|换成了',
    falsePositives: '交付物版本（"老用户安装 v0.1.13"是安装场景非变更史）；运行时新旧状态（生命周期）；反事实现在时（回归钉）；代码 token 如 `proxy.`；"实测"出处词',
  },
  {
    name: '评审编排与面向评审者的辩解',
    flags: 'g',
    src: '评审|上一轮|本轮修正|按评审意见|评审要求|二次审查|被拒绝',
    falsePositives: '"接受语义评审"这类**描述动作**；判据文本自身在举例说明什么算泄漏',
  },
  {
    name: '模糊措辞与规划残留',
    flags: 'g',
    src: '大概|应该够了|暂时|先这样|凑合|回头再说|待定',
    falsePositives: '"待定"作 pending 解（"待定的检查要报告为待定"讲的是检查状态）',
  },
  {
    name: '指示性戳记（最易误报，务必逐条判断）',
    flags: 'g',
    src: '本轮|本次|今天|现在|新的',
    falsePositives: '"今天"作当前行为解（陈述产品今天的行为 ≠ 版本戳）',
  },
  {
    name: '英文探针',
    flags: 'gi',
    src: '\\bthis PR\\b|\\bthis branch\\b|\\bprevious commits?\\b|\\bused to\\b|\\bno longer\\b|\\bpreviously\\b|rejected in review|\\bfor now\\b',
    falsePositives: '绑定了完整短语：`\\bthis PR\\b` 不匹配 `this project`/`this process`/`this provider`',
  },
].map((p) => ({ ...p, re: new RegExp(p.src, p.flags) }));

const DEFAULT_ROOTS = [path.join(SHELL, 'src'), path.join(SHELL, 'scripts'), path.join(REPO, 'plugins')];
// 自测用 SSID_COT_ROOTS 注入临时目录（path.delimiter 分隔），使自测演练**脚本本身**而非副本
const ROOTS = process.env.SSID_COT_ROOTS
  ? process.env.SSID_COT_ROOTS.split(path.delimiter).filter(Boolean)
  : DEFAULT_ROOTS;
const EXTRA_FILES = ROOTS === DEFAULT_ROOTS ? [path.join(SHELL, 'main.mjs'), path.join(SHELL, 'kernel.ts')] : [];
const EXTS = ['.ts', '.mjs', '.cjs', '.js'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'dist-electron', 'out', 'lib', 'vendor', '.deploy.new', '.deploy.old']);

const files = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  (function visit(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) visit(path.join(d, e.name)); }
      // 跳过自身：本文件**包含探针词表**，扫它命中率恒 100% 且几乎全为假阳性。
      // 这正是 recall-batteries.md「已知假阳性家族」最后一条说的情况 ——
      // 判据文本必然出现这些词（实测其扫描自己那 8 份 SKILL.md 命中 24 处、真泄漏 0）。
      else if (EXTS.includes(path.extname(e.name)) && !e.name.startsWith('check-cot-leakage')) files.push(path.join(d, e.name));
    }
  })(root);
}
for (const f of EXTRA_FILES) if (fs.existsSync(f)) files.push(f);

const buckets = PROBES.map((p) => ({ ...p, hits: [] }));
let total = 0;
for (const f of files) {
  const rel = path.relative(REPO, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const b of buckets) {
      // 每组探针每行只记一次，免得同一行多词重复计数
      b.re.lastIndex = 0;
      if (b.re.test(line)) { b.hits.push({ rel, line: i + 1, text: line.trim().slice(0, 110) }); total++; }
    }
  });
}

console.log('\n  ══ check-cot-leakage · CoT 泄漏候选（报告型）');
console.log(`  扫描：${files.length} 个代码文件（.ts/.mjs/.cjs/.js）`);
console.log('  范围不含任何 .md：代码注释是主要载体，而 .md 里的变更叙事多为合法主场（决策记录/release notes/规范文档本身就在陈述变更史）');
console.log(`  探针：${PROBES.length} 组（逐字取自 recall-batteries.md）`);
console.log('');
console.log('  ⚠ 探针按设计会过度匹配，**每个命中都需要语义判断** —— 本脚本只给候选，不做判定。');
console.log('');

for (const b of buckets) {
  if (!b.hits.length) { console.log(`  · ${b.name}：0 处`); continue; }
  console.log(`  [${b.name}]  ${b.hits.length} 处`);
  for (const h of b.hits.slice(0, 12)) console.log(`      ${h.rel}:${h.line}  ${h.text}`);
  if (b.hits.length > 12) console.log(`      …另有 ${b.hits.length - 12} 处`);
  console.log(`      已知误报家族：${b.falsePositives}`);
  console.log('');
}

console.log(`  ── 合计 ${total} 处候选 / ${files.length} 个文件 ──`);
if (total === 0) {
  console.log('  · 零命中。注意校准纪律：**零命中什么都证明不了，直到探针命中一个已知正例**');
  console.log('    （自测 check-cot-leakage.spec.mjs 会造正例验证探针确实在工作）');
}
console.log(STRICT ? `  --strict：有候选即退出 1\n` : '  报告型：不阻塞流程（加 --strict 可令其阻塞）\n');

process.exit(STRICT && total > 0 ? 1 : 0);
