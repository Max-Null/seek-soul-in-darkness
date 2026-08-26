import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROMPT_SEEDS, seedPromptLibrary } from '../src/prompt-seeds.ts'

/** 在隔离目录跑种子：DSH_HOME 指向临时目录，避免触碰真实环境。 */
function withHome(fn: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'dsh-seed-'))
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    fn(home)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
    rmSync(home, { recursive: true, force: true })
  }
}

test('seedPromptLibrary：空库写入全部种子（格式可被 dsh-memory 解析）', () => {
  withHome((home) => {
    const written = seedPromptLibrary()
    assert.equal(written, PROMPT_SEEDS.length)
    const dir = join(home, 'prompt-library')
    const files = readdirSync(dir).filter(name => name.endsWith('.md'))
    assert.equal(files.length, PROMPT_SEEDS.length)
    // 命名约定：序号_名称.md
    assert.ok(files.includes('1_代码审查.md'))
    assert.ok(files.includes('2_周报项目总结.md'))
    // frontmatter：首行 ---，name 字段存在且与来源同名
    const first = readFileSync(join(dir, '1_代码审查.md'), 'utf8')
    assert.ok(first.startsWith('---\n'))
    assert.ok(first.includes('name: "代码审查"'))
    assert.ok(first.includes('source: user'))
    assert.ok(first.includes('createdAt: '))
  })
})

test('seedPromptLibrary：目录已有 md 时跳过（幂等，不覆盖用户模板）', () => {
  withHome((home) => {
    const dir = join(home, 'prompt-library')
    mkdirSync(dir, { recursive: true })
    const userFile = join(dir, '9_我的模板.md')
    writeFileSync(userFile, '---\nname: "我的模板"\n---\n正文', 'utf8')
    const written = seedPromptLibrary()
    assert.equal(written, 0)
    assert.ok(existsSync(userFile))
    assert.equal(readdirSync(dir).length, 1)
  })
})

test('seedPromptLibrary：种子文件名不含 Windows 保留字符且各有完整 frontmatter', () => {
  withHome((home) => {
    seedPromptLibrary()
    const dir = join(home, 'prompt-library')
    const files = readdirSync(dir).filter(name => name.endsWith('.md'))
    assert.equal(files.length, PROMPT_SEEDS.length)
    for (const name of files) {
      assert.ok(!/[<>:"/\\|?*]/.test(name), `filename ${name} 含保留字符`)
      const text = readFileSync(join(dir, name), 'utf8')
      assert.ok(text.startsWith('---\n'), `${name} 缺 frontmatter 开栏`)
      assert.ok(text.includes('\n---\n'), `${name} 缺 frontmatter 闭栏`)
      assert.ok(text.trim().length > 50, `${name} 正文过短`)
    }
  })
})

test('seedPromptLibrary：再次调用不再追加（目录已有种子文件）', () => {
  withHome((home) => {
    seedPromptLibrary()
    const again = seedPromptLibrary()
    assert.equal(again, 0)
  })
})
