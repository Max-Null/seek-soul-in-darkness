/**
 * 启发式 token 估算。
 *
 * 不依赖外部 tokenizer：英文（ASCII）约 4 字符/token，中文等非 ASCII 约 1.5
 * 字符/token。结果用于比较相对成本与趋势，不是精确计数（精确值以模型
 * tokenizer 为准）。
 */
export function estimateTokens(text) {
    let ascii = 0;
    let nonAscii = 0;
    for (const ch of text) {
        if (ch.codePointAt(0) < 0x80)
            ascii++;
        else
            nonAscii++;
    }
    return Math.ceil(ascii / 4 + nonAscii / 1.5);
}
/** 把 token 数格式化为人类可读：1234 -> "1.2k" */
export function formatTokens(n) {
    if (n >= 1000) {
        const k = n / 1000;
        return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
    }
    return String(n);
}
/** 把字节数格式化为人类可读。 */
export function formatBytes(n) {
    if (n >= 1024 * 1024)
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    if (n >= 1024)
        return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
}
