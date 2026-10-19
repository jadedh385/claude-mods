import { describe, expect, test } from 'claude-code/testing'

import { buildPrompt, buildSystem, clampContext, parseArgs } from './register'

describe('parseArgs', () => {
  test('shows usage when nothing is typed', () => {
    expect(parseArgs('   ')).toEqual({ kind: 'usage' })
  })

  test('treats a bare "undo" as undo', () => {
    expect(parseArgs('undo')).toEqual({ kind: 'undo' })
  })

  test('uses light mode by default', () => {
    expect(parseArgs('fix login')).toEqual({ kind: 'refine', mode: 'light', text: 'fix login' })
  })

  test('uses full mode when the text starts with "full"', () => {
    expect(parseArgs('full fix login')).toEqual({ kind: 'refine', mode: 'full', text: 'fix login' })
  })

  test('does not mistake a word starting with "full" for the mode', () => {
    expect(parseArgs('fullscreen is broken')).toEqual({
      kind: 'refine',
      mode: 'light',
      text: 'fullscreen is broken',
    })
  })
})

describe('prompt building', () => {
  test('full mode asks for the four headings and light mode does not', () => {
    expect(buildSystem('full')).toContain('Done when:')
    expect(buildSystem('light')).not.toContain('Done when:')
  })

  test('says so when no project context was found', () => {
    expect(buildPrompt('x', '')).toContain('(none found)')
  })

  test('caps project context and drops empty files', () => {
    const clamped = clampContext(['a'.repeat(20000), '  '])
    expect(clamped.length).toBe(12000)
  })
})

describe('/refine command', () => {
  test('puts the model rewrite in the prompt box', async ($, on) => {
    let filled = ''
    on('fs.read', () => ({ value: '' }))
    on('model.complete', () => ({
      value: {
        isAnswered: true,
        text: '  Fix the login redirect in auth/views.py.  ',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    }))
    on('prompt.fill', (_$, e) => {
      filled = e.text
      return { isFilled: true }
    })

    const result = await $.command.run({ command: 'refine', args: 'fix login' })

    expect(filled).toBe('Fix the login redirect in auth/views.py.')
    expect(result.text).toContain('Refined prompt is in the box')
  })

  test('leaves the box alone when the model call fails', async ($, on) => {
    let fillCount = 0
    on('fs.read', () => ({ value: '' }))
    on('model.complete', () => ({
      value: {
        isAnswered: false,
        reason: 'api-error',
        status: 529,
        error: 'overloaded',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }))
    on('prompt.fill', () => {
      fillCount += 1
      return { isFilled: true }
    })

    const result = await $.command.run({ command: 'refine', args: 'fix login' })

    expect(fillCount).toBe(0)
    expect(result.text).toContain('unchanged')
  })
})

const SURFACES = ['terminal', 'desktop', 'vscode'] as const
const BAND_PROPS = { hasSurvey: false, isWorking: false } as never


describe('button bar', () => {
  for (const surface of SURFACES) {
    test(`Refine button fills the box from the typed draft on ${surface}`, async ($, on) => {
      let filled = ''
      on('prompt.read', () => ({ value: { text: 'fix login', cursor: 9 } }))
      on('fs.read', () => ({ value: '' }))
      on('model.complete', () => ({
        value: {
          isAnswered: true,
          text: 'Fix the login redirect.',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }))
      on('prompt.fill', (_$, e) => {
        filled = e.text
        return { isFilled: true }
      })

      const band = await $.ui.mount({
        plugin: 'prompt-refiner',
        surface,
        component: 'AbovePrompt',
        props: BAND_PROPS,
      })
      await band.press({ key: 'refine' })

      expect(filled).toBe('Fix the login redirect.')
    })
  }

  test('does not call the model when the box is empty', async ($, on) => {
    let modelCalls = 0
    on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
    on('model.complete', () => {
      modelCalls += 1
      return { value: { isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage: { input_tokens: 0, output_tokens: 0 } } }
    })

    const band = await $.ui.mount({
      plugin: 'prompt-refiner',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })
    await band.press({ key: 'refine' })

    expect(modelCalls).toBe(0)
  })
})
