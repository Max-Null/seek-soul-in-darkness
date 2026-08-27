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

test('seedPromptLibrary：空库全量写入（格式可被 dsh-memory 解析）+ 版本标记', () => {
  withHome((home) => {
    const written = seedPromptLibrary()
    assert.equal(written, PROMPT_SEEDS.length)
    assert.ok(PROMPT_SEEDS.length > 15, `种子应含 GenUI 模板（现有 ${PROMPT_SEEDS.length}）`)
    const dir = join(home, 'prompt-library')
    const files = readdirSync(dir).filter(name => name.endsWith('.md'))
    assert.equal(files.length, PROMPT_SEEDS.length)
    // 命名约定：序号_名称.md
    assert.ok(files.includes('1_代码审查.md'))
    assert.ok(files.includes('2_周报项目总结.md'))
    // GenUI 模板条目（双入口：genui 面板模板中心 ↔ 记忆模板库）
    assert.ok(files.some(name => name.includes('GenUI-项目仪表盘.md')))
    assert.ok(files.some(name => name.includes('GenUI-3D场景.md')))
    // frontmatter：首行 ---，name 字段存在且与来源同名
    const first = readFileSync(join(dir, '1_代码审查.md'), 'utf8')
    assert.ok(first.startsWith('---\n'))
    assert.ok(first.includes('name: "代码审查"'))
    assert.ok(first.includes('source: user'))
    assert.ok(first.includes('createdAt: '))
    // GenUI 条目带 dimension/tags 且指令含 dsh-ui
    const genui = readFileSync(join(dir, '7_GenUI-项目仪表盘.md'), 'utf8')
    assert.ok(genui.includes('name: "GenUI-项目仪表盘"'))
    assert.ok(genui.includes('dimension: "GenUI"'))
    assert.ok(genui.includes('dsh-ui'))
    // 版本标记已写入
    assert.equal(readFileSync(join(dir, '.seed-version'), 'utf8').trim(), '2')
  })
})

test('seedPromptLibrary：v1 老用户升级——补 GenUI 条目、已有模板不覆盖、标记后不再补', () => {
  withHome((home) => {
    const dir = join(home, 'prompt-library')
    mkdirSync(dir, { recursive: true })
    // 模拟 v1 用户：6 个基础种子已存在（无版本标记）
    for (const name of ['1_代码审查.md', '2_周报项目总结.md', '3_翻译润色.md', '4_Bug排查.md', '5_会议纪要.md', '6_PPT制作.md']) {
      writeFileSync(join(dir, name), '---\nname: "x"\n---\n正文', 'utf8')
    }
    const written = seedPromptLibrary()
    assert.equal(written, PROMPT_SEEDS.length - 6, `应只补 GenUI 条目（实际补 ${written}）`)
    assert.equal(readdirSync(dir).filter(n => n.endsWith('.md')).length, PROMPT_SEEDS.length)
    // 已有文件未被覆盖
    assert.ok(readFileSync(join(dir, '1_代码审查.md'), 'utf8').includes('x'))
    // 标记写入 → 再调用不再补
    assert.equal(readFileSync(join(dir, '.seed-version'), 'utf8').trim(), '2')
    assert.equal(seedPromptLibrary(), 0)
  })
})

test('seedPromptLibrary：已有标记时跳过（用户删空模板不复活）', () => {
  withHome((home) => {
    const dir = join(home, 'prompt-library')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.seed-version'), '2', 'utf8')
    const written = seedPromptLibrary()
    assert.equal(written, 0)
    assert.equal(readdirSync(dir).filter(n => n.endsWith('.md')).length, 0)
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
