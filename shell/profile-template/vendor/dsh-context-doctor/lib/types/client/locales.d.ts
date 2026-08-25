/**
 * Context Doctor locale dictionaries.
 *
 * The panel follows the DSH shell's language: `ctx.locale.register` seats both
 * dictionaries and the host picks by its current setting, so every key here
 * must exist in both. Product and protocol nouns stay untranslated on purpose
 * — `token`, `schema`, `MCP`, `Context Doctor` read the same to a
 * Chinese-speaking developer and only drift once localized.
 */
export declare const NS = "context-doctor";
/** English dictionary; the key set every other dictionary mirrors. */
declare const en: {
    readonly 'cd.title': "Context Doctor";
    readonly 'cd.subtitle': "Resident context audit";
    readonly 'cd.hint': "Open Context Doctor";
    readonly 'cd.total': "Resident total";
    readonly 'cd.tokens': "tokens";
    readonly 'cd.residentUnit': "tokens resident";
    readonly 'cd.ofBudget': "of {budget} budget";
    readonly 'cd.instructions': "Instruction chain";
    readonly 'cd.skills': "Skills catalog";
    readonly 'cd.tools': "Tool schemas";
    readonly 'cd.mcp': "MCP tools";
    readonly 'cd.instructions.sub': "{n} files";
    readonly 'cd.skills.sub': "{n} skills";
    readonly 'cd.tools.sub': "{n} built-in tools";
    readonly 'cd.mcp.sub': "{n} tools · {servers} servers";
    readonly 'cd.emptyCategory': "nothing injected";
    readonly 'cd.expand': "Show breakdown";
    readonly 'cd.collapse': "Hide breakdown";
    readonly 'cd.byFile': "By file";
    readonly 'cd.bySource': "By source";
    readonly 'cd.byServer': "By server";
    readonly 'cd.topSchemas': "Largest schemas";
    readonly 'cd.native': "Built-in tools";
    readonly 'cd.duplicateBlocks': "{n} duplicated blocks · {tokens} tokens";
    readonly 'cd.duplicateSkills': "{n} skills share an identical description";
    readonly 'cd.shadowed': "{n} skills shadowed by a same-name entry";
    readonly 'cd.more': "+{n} more";
    readonly 'cd.noDetail': "No breakdown available";
    readonly 'cd.healthy': "Healthy";
    readonly 'cd.review': "Worth a look";
    readonly 'cd.heavy': "Over budget";
    readonly 'cd.healthyHint': "Resident context is lean and well inside the budget.";
    readonly 'cd.reviewHint': "A few injections are worth trimming before they get expensive.";
    readonly 'cd.heavyHint': "Resident context is crowding the budget. Trim the largest entries first.";
    readonly 'cd.suggestions': "Suggestions";
    readonly 'cd.loading': "Auditing…";
    readonly 'cd.error': "Audit failed";
    readonly 'cd.emptyState': "No audit data yet.";
    readonly 'cd.refresh': "Refresh";
    readonly 'cd.updated': "Updated {when}";
    readonly 'cd.justNow': "just now";
    readonly 'cd.secondsAgo': "{n}s ago";
    readonly 'cd.minutesAgo': "{n}m ago";
};
/** Simplified Chinese dictionary; mirrors {@link en} key for key. */
declare const zh: Record<keyof typeof en, string>;
export { en, zh };
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'context-doctor': keyof typeof en;
    }
}
