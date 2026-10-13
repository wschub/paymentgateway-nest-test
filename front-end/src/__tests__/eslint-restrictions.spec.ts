/**
 * @jest-environment node
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = path.resolve(__dirname, '..', '..')
const eslintBin = path.join(projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js')

interface EslintMessage {
  ruleId: string | null
}

function lint(code: string, relativeFile: string): EslintMessage[] {
  const result = spawnSync(
    process.execPath,
    [
      eslintBin,
      '--stdin',
      '--stdin-filename',
      relativeFile,
      '--format',
      'json',
    ],
    { cwd: projectRoot, input: code, encoding: 'utf8' },
  )

  const parsed = JSON.parse(result.stdout) as Array<{ messages: EslintMessage[] }>
  return parsed[0]?.messages ?? []
}

function hasRule(messages: EslintMessage[], ruleId: string): boolean {
  return messages.some((message) => message.ruleId === ruleId)
}

describe('ESLint layering restrictions', () => {
  it('flags a direct fetch call outside the API wrapper', () => {
    const messages = lint(
      'export const load = () => fetch("/products")\n',
      'src/features/catalog/leaky.ts',
    )
    expect(hasRule(messages, 'no-restricted-globals')).toBe(true)
  })

  it('allows fetch inside the API wrapper', () => {
    const messages = lint(
      'export const load = () => fetch("/products")\n',
      'src/shared/api/http.ts',
    )
    expect(hasRule(messages, 'no-restricted-globals')).toBe(false)
  })

  it('allows fetch inside the tokenization seam', () => {
    const messages = lint(
      'export const tokenize = () => fetch("https://provider.test/tokens/cards")\n',
      'src/shared/api/payment-provider.ts',
    )
    expect(hasRule(messages, 'no-restricted-globals')).toBe(false)
  })

  it('flags a direct fetch call in the checkout feature', () => {
    const messages = lint(
      'export const load = () => fetch("/transactions")\n',
      'src/features/checkout/leaky.ts',
    )
    expect(hasRule(messages, 'no-restricted-globals')).toBe(true)
  })

  it('flags import.meta outside the config seam', () => {
    const messages = lint(
      'export const url = import.meta.env.VITE_API_URL\n',
      'src/features/catalog/leaky.ts',
    )
    expect(hasRule(messages, 'no-restricted-syntax')).toBe(true)
  })

  it('allows import.meta inside the config seam', () => {
    const messages = lint(
      'export const url = import.meta.env.VITE_API_URL\n',
      'src/config.ts',
    )
    expect(hasRule(messages, 'no-restricted-syntax')).toBe(false)
  })

  it('exempts spec files from the fetch restriction', () => {
    const messages = lint(
      'export const spy = () => fetch("/products")\n',
      'src/features/catalog/example.spec.ts',
    )
    expect(hasRule(messages, 'no-restricted-globals')).toBe(false)
  })
})
