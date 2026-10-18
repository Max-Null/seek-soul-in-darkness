/**
 * Host-half Context mirror: the DSH family's `declare module '@deepseek-ai/cordis'`
 * augmentations do not reach a third-party plugin resolved against the bare
 * `cordis` runtime, so this file adds the one member the host half reads
 * beyond what dsh-host-webserver augments (webServer). webStartup is
 * dsh-web-app's route-fence source (trusted hosts); the family ships no
 * public declaration for it, so the mirror is structural-only.
 *
 * 0.2.1 起 dsh-web-app 用 `webStartup` 取代了被删除的 `webRuntime` 服务，这里的
 * 镜像随之改名——`inject` 里用的是同一个名字，两处必须一致。
 */
import 'cordis'

declare module 'cordis' {
  interface Context {
    /** webStartup service face (dsh-web-app): the fence's trusted hosts. */
    webStartup: { trustedHosts: string[] }
  }
}
