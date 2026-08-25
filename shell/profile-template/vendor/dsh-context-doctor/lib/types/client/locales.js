/**
 * Context Doctor locale dictionaries.
 *
 * The panel follows the DSH shell's language: `ctx.locale.register` seats both
 * dictionaries and the host picks by its current setting, so every key here
 * must exist in both. Product and protocol nouns stay untranslated on purpose
 * — `token`, `schema`, `MCP`, `Context Doctor` read the same to a
 * Chinese-speaking developer and only drift once localized.
 */
export const NS = 'context-doctor';
/** English dictionary; the key set every other dictionary mirrors. */
const en = {
    'cd.title': 'Context Doctor',
    'cd.subtitle': 'Resident context audit',
    'cd.hint': 'Open Context Doctor',
    // Budget summary
    'cd.total': 'Resident total',
    'cd.tokens': 'tokens',
    'cd.residentUnit': 'tokens resident',
    'cd.ofBudget': 'of {budget} budget',
    // Categories
    'cd.instructions': 'Instruction chain',
    'cd.skills': 'Skills catalog',
    'cd.tools': 'Tool schemas',
    'cd.mcp': 'MCP tools',
    // Category sublines
    'cd.instructions.sub': '{n} files',
    'cd.skills.sub': '{n} skills',
    'cd.tools.sub': '{n} built-in tools',
    'cd.mcp.sub': '{n} tools · {servers} servers',
    'cd.emptyCategory': 'nothing injected',
    // Drill-down
    'cd.expand': 'Show breakdown',
    'cd.collapse': 'Hide breakdown',
    'cd.byFile': 'By file',
    'cd.bySource': 'By source',
    'cd.byServer': 'By server',
    'cd.topSchemas': 'Largest schemas',
    'cd.native': 'Built-in tools',
    'cd.duplicateBlocks': '{n} duplicated blocks · {tokens} tokens',
    'cd.duplicateSkills': '{n} skills share an identical description',
    'cd.shadowed': '{n} skills shadowed by a same-name entry',
    'cd.more': '+{n} more',
    'cd.noDetail': 'No breakdown available',
    // Health
    'cd.healthy': 'Healthy',
    'cd.review': 'Worth a look',
    'cd.heavy': 'Over budget',
    'cd.healthyHint': 'Resident context is lean and well inside the budget.',
    'cd.reviewHint': 'A few injections are worth trimming before they get expensive.',
    'cd.heavyHint': 'Resident context is crowding the budget. Trim the largest entries first.',
    'cd.suggestions': 'Suggestions',
    // Lifecycle
    'cd.loading': 'Auditing…',
    'cd.error': 'Audit failed',
    'cd.emptyState': 'No audit data yet.',
    'cd.refresh': 'Refresh',
    'cd.updated': 'Updated {when}',
    'cd.justNow': 'just now',
    'cd.secondsAgo': '{n}s ago',
    'cd.minutesAgo': '{n}m ago',
};
/** Simplified Chinese dictionary; mirrors {@link en} key for key. */
const zh = {
    'cd.title': 'Context Doctor',
    'cd.subtitle': '常驻上下文审计',
    'cd.hint': '打开 Context Doctor',
    'cd.total': '常驻合计',
    'cd.tokens': 'token',
    'cd.residentUnit': 'token 常驻',
    'cd.ofBudget': '预算 {budget}',
    'cd.instructions': '指令链',
    'cd.skills': '技能目录',
    'cd.tools': '工具 schema',
    'cd.mcp': 'MCP 工具',
    'cd.instructions.sub': '{n} 个文件',
    'cd.skills.sub': '{n} 个技能',
    'cd.tools.sub': '{n} 个内置工具',
    'cd.mcp.sub': '{n} 个工具 · {servers} 个服务器',
    'cd.emptyCategory': '无注入',
    'cd.expand': '展开明细',
    'cd.collapse': '收起明细',
    'cd.byFile': '按文件',
    'cd.bySource': '按来源',
    'cd.byServer': '按服务器',
    'cd.topSchemas': '占用最大的 schema',
    'cd.native': '内置工具',
    'cd.duplicateBlocks': '{n} 处重复段落 · {tokens} token',
    'cd.duplicateSkills': '{n} 个技能描述完全相同',
    'cd.shadowed': '{n} 个技能被同名条目遮蔽',
    'cd.more': '还有 {n} 项',
    'cd.noDetail': '暂无明细',
    'cd.healthy': '健康',
    'cd.review': '建议查看',
    'cd.heavy': '超出预算',
    'cd.healthyHint': '常驻上下文很精简，距预算还有充足余量。',
    'cd.reviewHint': '有几项注入值得趁早裁剪，免得越滚越大。',
    'cd.heavyHint': '常驻上下文已挤占预算，优先裁掉占用最大的几项。',
    'cd.suggestions': '裁剪建议',
    'cd.loading': '审计中…',
    'cd.error': '审计失败',
    'cd.emptyState': '还没有审计数据。',
    'cd.refresh': '刷新',
    'cd.updated': '更新于 {when}',
    'cd.justNow': '刚刚',
    'cd.secondsAgo': '{n} 秒前',
    'cd.minutesAgo': '{n} 分钟前',
};
export { en, zh };
