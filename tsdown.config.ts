/**
 * tsdown build for @max-null/dsh-ssid-panels: the host-half lib (lib/index.js,
 * ESM node, /ssid/api routes) plus the browser client bundle (lib/client.js,
 * CJS closure factory registered through window.__ModuleLoader__ — the same
 * protocol better-sidebar uses). The client only value-imports react/cordis
 * (platform module-table words); dsh-better-sidebar is a type-only peer so
 * the bundle stays zero-coupled, and every other dependency is inlined.
 */
import type { UserConfig } from 'tsdown'

/** Module specifiers the web shell shares into the frozen module table. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
]

/** Browser-safe contract surfaces a client bundle may inline. */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(session|llm|tools)(\/|$)/

const purityGate = () => ({
  name: 'ssid-panels-client-purity',
  resolveId(source: string): null {
    if (source.startsWith('@deepseek-ai/')) {
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (INLINE_SAFE.test(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module and not an inline-safe wire layer — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services',
      )
    }
    return null
  },
})

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: true,
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [purityGate()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify('@max-null/dsh-ssid-panels')}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
] satisfies UserConfig[]
