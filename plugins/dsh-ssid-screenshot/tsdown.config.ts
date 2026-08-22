/**
 * tsdown build for @max-null/dsh-ssid-screenshot: the host-half lib
 * (lib/index.mjs, ESM node, /ssid/api/screenshot routes) plus the browser
 * client bundle (lib/client.js, CJS closure factory registered through
 * window.__ModuleLoader__ — the same protocol dsh-ssid-panels uses). The
 * client value-imports react/react-dom/cordis (platform module-table words);
 * cross-plugin @deepseek-ai value imports are blocked by the purity gate.
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

const purityGate = () => ({
  name: 'ssid-screenshot-client-purity',
  resolveId(source: string): null {
    if (source.startsWith('@deepseek-ai/')) {
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (/^@deepseek-ai\/dsh-(session|llm|tools)(\/|$)/.test(source)) return null
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
    entry: { client: 'src/client/index.ts' },
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
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify('@max-null/dsh-ssid-screenshot')}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
] satisfies UserConfig[]
