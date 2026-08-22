/**
 * Host-half Context mirror: the DSH family's `declare module 'cordis'`
 * augmentations do not reach a third-party plugin resolved against the bare
 * `cordis` runtime, so this file adds the one member the host half reads
 * beyond what dsh-host-webserver augments (webServer). webRuntime is
 * dsh-web-app's route-fence source (trusted hosts); the family ships no
 * public declaration for it, so the mirror is structural-only.
 */
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** webRuntime service face (dsh-web-app): the fence's trusted hosts. */
    webRuntime: { trustedHosts: string[] }
  }
}

export type { Context }
