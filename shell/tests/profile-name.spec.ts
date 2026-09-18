/**
 * profile 名解析 —— 出厂默认值必须与历史路径逐字一致，覆盖值必须自证合法。
 *
 * 为什么值得单独测：这两个函数决定 profile 目录与会话存储根的绝对路径。默认值
 * 漂移会让升级后的实例认不出自己的 profile；校验漏掉路径分隔符则会让
 * `SSID_PROFILE_NAME` 把写入带出 `profiles/`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PROFILE_NAME,
  resolveProfileName,
  sessionsRootDirName,
} from '../lib/profile-name.mjs'

test('未设置或只给空白时回落出厂名', () => {
  assert.equal(resolveProfileName({}), 'ssid')
  assert.equal(resolveProfileName({ SSID_PROFILE_NAME: '' }), 'ssid')
  assert.equal(resolveProfileName({ SSID_PROFILE_NAME: '   ' }), 'ssid')
})

test('覆盖值去空白后原样采用', () => {
  assert.equal(resolveProfileName({ SSID_PROFILE_NAME: ' ssid-dev ' }), 'ssid-dev')
  assert.equal(resolveProfileName({ SSID_PROFILE_NAME: 'ssid-a' }), 'ssid-a')
})

test('拒绝路径分隔符与保留名', () => {
  for (const bad of ['.', '..', 'node_modules', 'a/b', 'a\\b', '../evil', 'x/../y']) {
    assert.throws(
      () => resolveProfileName({ SSID_PROFILE_NAME: bad }),
      /SSID_PROFILE_NAME 非法/,
      `应拒绝 ${JSON.stringify(bad)}`,
    )
  }
})

test('默认 profile 的会话根与历史目录名逐字一致', () => {
  assert.equal(sessionsRootDirName(DEFAULT_PROFILE_NAME), 'sessions-ssid')
  assert.equal(sessionsRootDirName(resolveProfileName({})), 'sessions-ssid')
})

test('会话根跟随 profile 名分开', () => {
  assert.equal(sessionsRootDirName('ssid-dev'), 'sessions-ssid-dev')
  assert.notEqual(
    sessionsRootDirName(resolveProfileName({ SSID_PROFILE_NAME: 'ssid-dev' })),
    sessionsRootDirName(DEFAULT_PROFILE_NAME),
  )
})
