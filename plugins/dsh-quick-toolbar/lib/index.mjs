/**
 * @max-null/dsh-quick-toolbar — host half (no-op).
 *
 * The alignment work happens entirely in the browser half (./client): it
 * injects CSS that aligns dsh-better-sidebar's toggle cluster with the DSH
 * session header utilities row. The empty apply exists so the bundle row
 * appears in the profile cordis.yml / Loader (same pattern as
 * @deepseek-ai/dsh-cordis-client-runner).
 */

export const name = '@max-null/dsh-quick-toolbar'

/** This plugin needs no host services. */
export const inject = []

/** Nothing to mount host-side; the client half does all the work. */
export function apply() {}
