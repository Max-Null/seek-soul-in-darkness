/**
 * lib/codegraph-adapt.mjs 单测（node:test + tsx）。
 * 覆盖：索引目录解析优先级、可用性校验（拒绝主目录/祖先）、配置读写、
 * 会话 artifact 探测（zstd 首帧 header cwd）。
 * 运行：node --import tsx/esm --test tests/codegraph-adapt.spec.ts
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import {
  CG_CONFIG_FILE,
  CG_EXCLUDE_DIRS,
  codeGraphProtectionArgs,
  detectRecentWorkspace,
  isUsableWorkspace,
  readArtifactCwd,
  readCodeGraphConfig,
  resolveCodeGraphWorkspace,
  writeCodeGraphConfig,
} from '../lib/codegraph-adapt.mjs'

const HAS_ZSTD = typeof zlib.zstdCompressSync === 'function'

/** 造一个与会话存储同构的 artifact（首个 zstd 帧 = header JSON 行）。 */
function writeArtifact(root: string, project: string, sessionId: string, header: Record<string, unknown>): string {
  const artifact = join(root, project, sessionId, 'session.jsonl.zstd')
  mkdirSync(dirname(artifact), { recursive: true })
  writeFileSync(artifact, zlib.zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n', 'utf8')))
  return artifact
}

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'cg-adapt-'))
}

test('isUsableWorkspace：存在目录可用；主目录本身与主目录祖先不可用', () => {
  const root = tmpDir()
  const project = join(root, 'project')
  mkdirSync(project, { recursive: true })
  assert.equal(isUsableWorkspace(project, homedir()), true)
  // 主目录本身：正是本次事故的默认值，必须拒绝
  assert.equal(isUsableWorkspace(homedir(), homedir()), false)
  // 主目录的祖先（如 C:\Users）：等于把整个用户区当项目索引
  assert.equal(isUsableWorkspace(dirname(homedir()), homedir()), false)
  // 不存在 / 空 / 非字符串
  assert.equal(isUsableWorkspace(join(root, 'nope'), homedir()), false)
  assert.equal(isUsableWorkspace('', homedir()), false)
  assert.equal(isUsableWorkspace(null, homedir()), false)
})

test('readCodeGraphConfig / writeCodeGraphConfig：往返且无 BOM', () => {
  const path = join(tmpDir(), CG_CONFIG_FILE)
  assert.equal(readCodeGraphConfig(path), null)
  writeCodeGraphConfig(path, { workspace: 'D:\\Project\\ai-platform', decided: true })
  const back = readCodeGraphConfig(path)
  assert.equal(back?.workspace, 'D:\\Project\\ai-platform')
  assert.equal(back?.decided, true)
})

test('readArtifactCwd：从首帧 header 取 cwd；损坏/缺失字段返回 undefined', { skip: !HAS_ZSTD }, () => {
  const root = tmpDir()
  const good = writeArtifact(root, 'proj', 's1', { cwd: 'D:\\Project\\ai-platform', id: 's1' })
  assert.equal(readArtifactCwd(good), 'D:\\Project\\ai-platform')
  const noCwd = writeArtifact(root, 'proj', 's2', { id: 's2' })
  assert.equal(readArtifactCwd(noCwd), undefined)
  const broken = join(root, 'proj', 's3', 'session.jsonl.zstd')
  mkdirSync(dirname(broken), { recursive: true })
  writeFileSync(broken, Buffer.from('not zstd at all'))
  assert.equal(readArtifactCwd(broken), undefined)
})

test('detectRecentWorkspace：取最近修改的会话 cwd，跳过主目录与已删除目录', { skip: !HAS_ZSTD }, () => {
  const root = tmpDir()
  const home = join(root, 'home')
  const older = join(root, 'older-project')
  const newer = join(root, 'newer-project')
  mkdirSync(older, { recursive: true })
  mkdirSync(newer, { recursive: true })
  mkdirSync(home, { recursive: true })
  // 较旧的会话指向 older；较新的会话先指向「主目录」（必须被跳过）
  const oldArtifact = writeArtifact(root, 'p', 's-old', { cwd: older })
  const newArtifact = writeArtifact(root, 'p', 's-new', { cwd: home })
  const past = Date.now() - 60_000
  writeFileSync(oldArtifact, zlib.zstdCompressSync(Buffer.from(JSON.stringify({ cwd: older }) + '\n', 'utf8')))
  // 用 utimes 固定 mtime，避免测试同秒写入导致顺序不确定
  utimesSync(oldArtifact, past / 1000, past / 1000)
  utimesSync(newArtifact, Date.now() / 1000, Date.now() / 1000)
  // 最新会话指向主目录 → 跳过 → 回退到次新的 older
  assert.equal(detectRecentWorkspace([root], home), older)
  // 无会话根 → null
  assert.equal(detectRecentWorkspace([join(root, 'missing')], home), null)
})

test('resolveCodeGraphWorkspace：env > config > 探测 > none', { skip: !HAS_ZSTD }, () => {
  const root = tmpDir()
  const home = join(root, 'home')
  const envDir = join(root, 'env-project')
  const cfgDir = join(root, 'cfg-project')
  const detDir = join(root, 'det-project')
  for (const dir of [home, envDir, cfgDir, detDir]) mkdirSync(dir, { recursive: true })
  writeArtifact(root, 'p', 's1', { cwd: detDir })

  assert.deepEqual(
    resolveCodeGraphWorkspace({ envWorkspace: envDir, config: { workspace: cfgDir }, sessionRoots: [root], home }),
    { workspace: envDir, source: 'env' },
  )
  assert.deepEqual(
    resolveCodeGraphWorkspace({ envWorkspace: undefined, config: { workspace: cfgDir }, sessionRoots: [root], home }),
    { workspace: cfgDir, source: 'config' },
  )
  assert.deepEqual(
    resolveCodeGraphWorkspace({ envWorkspace: undefined, config: {}, sessionRoots: [root], home }),
    { workspace: detDir, source: 'detected' },
  )
  assert.deepEqual(
    resolveCodeGraphWorkspace({ envWorkspace: undefined, config: {}, sessionRoots: [join(root, 'missing')], home }),
    { workspace: null, source: 'none' },
  )
})

test('resolveCodeGraphWorkspace：指向主目录的配置一律不采用（回归本次事故）', () => {
  assert.deepEqual(
    resolveCodeGraphWorkspace({ envWorkspace: homedir(), config: null, sessionRoots: [], home: homedir() }),
    { workspace: null, source: 'none' },
  )
  assert.deepEqual(
    resolveCodeGraphWorkspace({
      envWorkspace: undefined,
      config: { workspace: dirname(homedir()) },
      sessionRoots: [],
      home: homedir(),
    }),
    { workspace: null, source: 'none' },
  )
})

test('codeGraphProtectionArgs：排除清单展开为成对 argv，含报告要求的目录', () => {
  const args = codeGraphProtectionArgs()
  assert.equal(args.length, CG_EXCLUDE_DIRS.length * 2)
  for (const dir of ['node_modules', '.git', 'AppData', 'target', 'dist']) {
    assert.ok(args.includes(dir), `${dir} 应在出厂保护清单里`)
  }
  assert.equal(args.filter((a) => a === '--exclude').length, CG_EXCLUDE_DIRS.length)
  // 空/非法项被跳过
  assert.deepEqual(codeGraphProtectionArgs(['a', '', null as unknown as string]), ['--exclude', 'a'])
})
