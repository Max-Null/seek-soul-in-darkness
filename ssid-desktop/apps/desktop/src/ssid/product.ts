/**
 * 壳的产品名。
 *
 * 不走 `app.name`：Electron 由它派生默认 userData 目录，改名会丢现有配置
 * （见 `main.ts` 中保持 `app.name` 稳定的说明）；而且 dev 下它的值是包名
 * `@deepseek-ai/dsh-desktop`，与打包后的 `productName` 不一致，会把包名漏给用户看。
 * 凡是要显示给人的名字都从这里取。打包名由 `scripts/electron-builder-config.mjs` 的
 * `productName` 决定，两处必须同名。
 */
export const SSID_PRODUCT_NAME = '思灵'

/**
 * 上游的产品名。
 *
 * 页面 `<title>` 用的是它，而窗口标题默认由页面标题派生 —— 任务栏与 Alt+Tab 读的正是
 * 那个窗口标题，所以 `main.ts` 必须在这里把它换掉。官方两端同名，看不出来；思灵不同名。
 */
export const DSH_PRODUCT_NAME = 'DeepSeek Harness'
