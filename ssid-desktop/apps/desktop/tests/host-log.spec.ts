import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createHostLogSink, hostLogPath } from '../src/ssid/host-log.ts'

const created: string[] = []

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ssid-host-log-'))
  created.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('places the Host log under the configured DSH_HOME', () => {
  expect(hostLogPath({ DSH_HOME: 'C:\\custom-home' })).toBe(join('C:\\custom-home', 'logs', 'host.log'))
})

it('falls back to ~/.dsh when DSH_HOME is absent or empty', () => {
  const expected = join(homedir(), '.dsh', 'logs', 'host.log')
  expect(hostLogPath({})).toBe(expected)
  expect(hostLogPath({ DSH_HOME: '' })).toBe(expected)
})

it('creates missing directories and appends what the sink writes', async () => {
  const path = join(scratch(), 'nested', 'logs', 'host.log')
  const sink = createHostLogSink(path)
  sink.write('first line\n')
  sink.write('second line\n')
  await sink.close()
  expect(readFileSync(path, 'utf8')).toBe('first line\nsecond line\n')
})

it('appends to an existing log instead of truncating it', async () => {
  const path = join(scratch(), 'host.log')
  writeFileSync(path, 'earlier run\n')
  const sink = createHostLogSink(path)
  sink.write('this run\n')
  await sink.close()
  expect(readFileSync(path, 'utf8')).toBe('earlier run\nthis run\n')
})

it('rotates one oversized generation aside before reopening', async () => {
  const path = join(scratch(), 'host.log')
  writeFileSync(path, 'x'.repeat(8 * 1024 * 1024 + 1))
  const sink = createHostLogSink(path)
  sink.write('fresh\n')
  await sink.close()
  expect(readFileSync(`${path}.1`, 'utf8').length).toBe(8 * 1024 * 1024 + 1)
  expect(readFileSync(path, 'utf8')).toBe('fresh\n')
})

it('keeps a small existing log in place rather than rotating it', async () => {
  const path = join(scratch(), 'host.log')
  writeFileSync(path, 'small\n')
  const sink = createHostLogSink(path)
  await sink.close()
  expect(statSync(path).size).toBe(6)
  expect(() => statSync(`${path}.1`)).toThrow()
})
