/** The pinned builder template keeps its registration flow around staged directory replacement. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { directoryInstallerExits, directoryInstallSection, directoryUninstaller } from '../scripts/windows-directory-installer.mjs'

const require = createRequire(import.meta.url)
const section = readFileSync(join(dirname(require.resolve('app-builder-lib/package.json')),
  'templates/nsis/installSection.nsh'), 'utf8')

it('keeps data cleanup out of the upstream template while retaining application removal and registration cleanup', () => {
  const source = readFileSync(join(dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis/uninstaller.nsh'), 'utf8')
  const adapted = directoryUninstaller(source)
  expect(adapted).not.toContain('--delete-app-data')
  expect(adapted).not.toContain('RMDir /r "$APPDATA')
  expect(adapted).toContain('!insertmacro customUnInstall')
  expect(adapted).toContain('DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"')
  expect(adapted).toContain('DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"')
  expect(directoryUninstaller(source.replaceAll('\n', '\r\n'))).toBe(adapted)
  expect(adapted).toContain('RMDir /r "\\\\?\\$INSTDIR"')
  expect(() => directoryUninstaller(source.replace('  Var /GLOBAL isDeleteAppData\n', ''))).toThrow('template changed')
  expect(() => directoryUninstaller(source.replace('  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"', ''))).toThrow('template changed')
})

it.each(['allowOnlyOneInstallerInstance.nsh', 'installUtil.nsh'])('cleans staged files before %s exits', (helper) => {
  const source = readFileSync(join(dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis/include', helper), 'utf8')
  const exits = source.match(/^\s*Quit\s*$/gm) ?? []
  expect(exits.length).toBeGreaterThan(0)
  const adapted = directoryInstallerExits(source)
  expect(adapted.match(/Call dshCleanupDirectories/g)).toHaveLength(exits.length)
  expect(adapted).toContain('!ifndef BUILD_UNINSTALLER')
})

it('moves the existing installation aside before the payload is extracted', () => {
  const result = directoryInstallSection(section)
  // The prepare step must run before extraction: a blocked rename has to surface before 427 MB
  // are unpacked, which is what made the old promote-after-extract order fail at 96%.
  expect(result.indexOf('!insertmacro dshStageApplication')).toBeLessThan(result.indexOf('!insertmacro installApplicationFiles'))
  expect(result.indexOf('!insertmacro dshStageApplication')).toBeLessThan(result.indexOf('!insertmacro CHECK_APP_RUNNING'))
  // The payload now lands directly in the final directory, so upstream's call stays where it is.
  expect(result).toContain('!insertmacro installApplicationFiles')
  expect(result).not.toContain('Call dshPromoteDirectories')
  expect(result).toContain('!insertmacro addStartMenuLink $keepShortcuts')
  expect(result).toContain('!insertmacro addDesktopLink $keepShortcuts')
  expect(result).toContain('!insertmacro handleUninstallResult HKEY_CURRENT_USER')
  expect(result).not.toContain('File /oname=uninstallerIcon.ico')
})

it.each([
  '!include installer.nsh',
  '!insertmacro setLinkVars',
  '!ifdef UNINSTALLER_ICON\n  File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"\n!endif\n',
])(
  'rejects a missing or duplicate upstream insertion point: %s', (point) => {
    expect(() => directoryInstallSection(section.replace(point, ''))).toThrow('Desktop NSIS template changed')
    expect(() => directoryInstallSection(`${section}\n${point}`)).toThrow('Desktop NSIS template changed')
  },
)
