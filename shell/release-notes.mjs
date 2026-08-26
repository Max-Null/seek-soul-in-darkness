/**
 * release-notes.mjs — 启动更新日志弹窗的纯逻辑（无 Electron 依赖，node --test 可测）
 *
 * 设计参照 fractal ChangelogDialog（docs/决策 设计验证）：
 *   - 版本必须有条目（守卫）：release-notes.md 首行 `# vX.Y.Z` 必须等于当前 app 版本，
 *     否则不弹（防发版漏同步导致乱弹/弹错版本）；
 *   - 每版本只弹一次：seen 记录最近已看版本；seen !== 当前版本才弹，关闭后写 seen。
 */

/** 从 release-notes 文本提取版本号（首行 `# vX.Y.Z`）。无匹配返回 null。 */
export function extractVersion(notes) {
  if (typeof notes !== 'string') return null
  const m = /^#\s*v?(\d+\.\d+\.\d+(?:[-+][\S]+)?)/m.exec(notes.trim())
  return m ? m[1] : null
}

/** 规范化（小写、去 v 前缀），用于比较。 */
export function normVersion(v) {
  return typeof v === 'string' ? v.replace(/^v/i, '').trim() : null
}

/**
 * 应该弹出吗？
 * @param notes      release-notes 文本（打包内置）
 * @param appVersion 当前应用版本（app.getVersion()）
 * @param seenVersion 已看版本（'0.1.13'）；无记录传入 '' 或 null（= 首次）
 */
export function shouldShow(notes, appVersion, seenVersion) {
  const entry = extractVersion(notes)
  const app = normVersion(appVersion)
  if (entry === null || app === null) return false   // 无条目/无版本 → 不弹（守卫）
  if (normVersion(entry) !== app) return false       // 条目版本 ≠ 当前版本 → 不弹（守卫）
  return normVersion(seenVersion) !== app            // 本版本看过 → 不弹；否则弹（含首次）
}

/** HTML 转义（防 markdown 注入）。 */
const esc = (s) => String(s)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

/**
 * 迷你 markdown → 安全 HTML（覆盖 release notes 实际用到的语法）：
 *   `# ` 大标题（版本行→面板头） / `## ` 节标题 / `- ` 圆点列表 / `**加粗**` / 普通段落
 * 返回 { title, date, sectionsHtml }——按钮与头部由调用方弹窗 HTML 组装。
 */
export function renderNotes(notes) {
  const lines = String(notes).split('\n')
  let title = null
  let date = null
  const sections = []
  let current = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h1 = /^#\s+(.+)$/.exec(line)
    const h2 = /^##\s+(.+)$/.exec(line)
    const li = /^-\s+(.+)$/.exec(line)
    const dateLine = /^[>]?\s*(?:>\s*)?(20\d{2}-\d{2}-\d{2})/.exec(line)
    if (h1) {
      title = h1[1]
      const d = /[（(](20\d{2}-\d{2}-\d{2})[)）]/.exec(h1[1])
      if (d) date = d[1]
      continue
    }
    if (h2) {
      current = { heading: h2[1], items: [] }
      sections.push(current)
      continue
    }
    if (li && current) {
      current.items.push(li[1])
      continue
    }
    if (dateLine && title !== null && date === null) {
      date = dateLine[1]
      continue
    }
  }
  const fmt = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  const sectionsHtml = sections
    .filter((s) => s.items.length > 0)
    .map((s) =>
      `<section><h3>${fmt(s.heading)}</h3><ul>${s.items.map((i) => `<li><span></span>${fmt(i)}</li>`).join('')}</ul></section>`,
    )
    .join('')
  return { title, date, sectionsHtml }
}
