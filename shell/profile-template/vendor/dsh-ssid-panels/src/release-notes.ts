/**
 * release-notes.ts — 更新日志解析（host 半，零依赖、可单测）。
 *
 * 数据源：包内 release-notes.md（发版时从 docs/release-notes-vX.Y.Z.md 同步，
 * 随 vendor/profile 进 node_modules——离线可用，不依赖检查更新/网络）。
 * 设计参照 fractal ChangelogDialog：版本必须有条目（守卫），client 端
 * seen 版本 != 当前版本才弹（每版本只弹一次）。
 */

export interface RnsSection {
  heading: string
  items: string[]
}

export interface RnsParsed {
  /** 首行 `# vX.Y.Z` 提取的版本号；无匹配为 null（守卫：不弹不显示）。 */
  version: string | null
  title: string | null
  date: string | null
  sections: RnsSection[]
}

/** 从 release-notes 文本提取版本号（首行 `# vX.Y.Z`）。无匹配返回 null。 */
export function extractVersion(notes: unknown): string | null {
  if (typeof notes !== 'string') return null
  const m = /^#\s*v?(\d+\.\d+\.\d+(?:[-+][\S]+)?)/m.exec(notes.trim())
  return m !== null ? m[1] : null
}

/** 规范化比较用版本（去 v 前缀、trim）。 */
export function normVersion(version: unknown): string | null {
  return typeof version === 'string' ? version.replace(/^v/i, '').trim() : null
}

/** 解析标题/日期/分节（覆盖 release notes 实际语法：`# `、`## `、`- `、标题内日期）。 */
export function parseReleaseNotes(notes: unknown): RnsParsed {
  if (typeof notes !== 'string') return { version: null, title: null, date: null, sections: [] }
  let title: string | null = null
  let date: string | null = null
  const sections: RnsSection[] = []
  let current: RnsSection | null = null
  for (const raw of String(notes).split('\n')) {
    const line = raw.trimEnd()
    const h1 = /^#\s+(.+)$/.exec(line)
    const h2 = /^##\s+(.+)$/.exec(line)
    const li = /^-\s+(.+)$/.exec(line)
    if (h1 !== null) {
      title = h1[1]
      const d = /[（(](20\d{2}-\d{2}-\d{2})[)）]/.exec(h1[1])
      if (d !== null) date = d[1]
      continue
    }
    if (h2 !== null) {
      current = { heading: h2[1], items: [] }
      sections.push(current)
      continue
    }
    if (li !== null && current !== null) {
      current.items.push(li[1])
    }
  }
  return { version: extractVersion(notes), title, date, sections: sections.filter(s => s.items.length > 0) }
}
