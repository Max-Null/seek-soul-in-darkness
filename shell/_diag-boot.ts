import { bootKernel } from './kernel.ts'

function flatten(error: unknown, depth = 0): string[] {
  const pad = '  '.repeat(depth)
  if (error instanceof AggregateError) {
    const lines = [`${pad}AggregateError: ${error.message}`]
    for (const e of error.errors) lines.push(...flatten(e, depth + 1))
    return lines
  }
  if (error instanceof Error) {
    const lines = [`${pad}${error.name}: ${error.message}`]
    if (error.cause !== undefined) lines.push(...flatten(error.cause, depth + 1))
    return lines
  }
  return [`${pad}${String(error)}`]
}

try {
  const { port } = await bootKernel()
  console.log(`OK port=${port}`)
  process.exit(0)
} catch (cause) {
  console.log('FAILED:\n' + flatten(cause).join('\n'))
  process.exit(1)
}
