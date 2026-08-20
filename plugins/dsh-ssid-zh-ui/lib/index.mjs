/**
 * @max-null/dsh-ssid-zh-ui — host half (no-op).
 *
 * 输入框中文化在浏览器端完成（v2 决策）：host 数据保持英文原文，client
 * half 按当前界面语言替换渲染文本（`ctx.locale` 事件驱动，切换即时生效，
 * 不受 host 投影/目录缓存影响）。本 half 仅占位，随 bundle patch 挂载。
 */
export const name = '@max-null/dsh-ssid-zh-ui'

/** 占位 apply：汉化逻辑全部在 client half（lib/client.js）。 */
export function apply() {}
