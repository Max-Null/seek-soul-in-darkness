/**
 * updater.mjs — 绑定层：把 electron-updater 接到 updater-core 纯逻辑。
 * 仅由 main.mjs（Electron 主进程）加载；单测走 updater-core.test.mjs。
 */
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { createShellUpdaterCore } from './updater-core.mjs'

const { autoUpdater } = electronUpdater

export function createShellUpdater() {
  return createShellUpdaterCore({
    isPackaged: app.isPackaged,
    autoUpdater: {
      ...autoUpdater,
      // install 静默拉起安装器（assisted NSIS /S）；detached 后主进程退出接管
      spawnInstaller: (installer) => {
        import('node:child_process').then(({ spawn }) => {
          spawn(installer, ['/S'], { detached: true, stdio: 'ignore' }).unref()
        })
      },
    },
    app,
  })
}
