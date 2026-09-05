import { defineConfig } from '@playwright/test'

/**
 * SSiD 插件实机适配回归测试配置。
 * 接入方式：CDP 直连运行中的 SSiD dev（Electron 调试端口，默认 9222）；
 * 用例不 launch 浏览器，只连接已有实例。
 * 基线截图：baselines/ 下按用例文件路径组织（首次用 `pnpm baseline` 生成）。
 */
export default defineConfig({
  testDir: './cases',
  timeout: 60_000,
  retries: 0,
  snapshotPathTemplate: '{testDir}/../baselines/{testFilePath}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
})
