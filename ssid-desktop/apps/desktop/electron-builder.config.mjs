/** Ordinary release entry; qualification imports the environment-independent factory. */
import { DESKTOP_PRODUCT_NAME, createElectronBuilderConfig } from './scripts/electron-builder-config.mjs'

export { DESKTOP_PRODUCT_NAME, createElectronBuilderConfig }
export default createElectronBuilderConfig()
