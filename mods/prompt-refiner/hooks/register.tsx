import type { EngineInterface, Register } from 'claude-code'

const COMMAND = 'refine'
const REFINER_MODEL = 'haiku'
const MAX_CONTEXT_CHARS = 12000
const TIMEOUT_MS = 20000
const CONTEXT_FILES = ['CLAUDE.md', '.claude/refine.md'] as const

const USAGE =
  'Usage: /refine <rough prompt>  (light cleanup)\n' +
  '       /refine full <rough prompt>  (Task / Context / Constraints / Done-when)\n' +
  '       /refine undo  (restore your original text)'

const BASE_RULES = `You rewrite a developer's rough prompt into a clear, executable prompt for Claude Code.
You are given RAW_PROMPT and PROJECT_CONTEXT (excerpts of the repo's instructions).

Do:
- Keep the user's intent and scope exactly. Never add features, files, or steps they did not imply.
- Replace vague terms ("fix", "better", "clean up") with specific, checkable outcomes.
- Name files, commands, or conventions from PROJECT_CONTEXT only when directly relevant (max 3).
- Where a needed detail is unknown, write it as [ASK: question] instead of guessing.
- If RAW_PROMPT is already specific, return it unchanged.

Output ONLY the rewritten prompt. No preamble, no explanation, no markdown fences.`

const FULL_RULES = `

Structure the output with these headings, omitting any that have nothing real to say:
Task:
Context:
Constraints:
Done when:`

const LIGHT_RULES = `

Keep the user's own wording and structure where it is already clear. Change only what is vague.`

export type RefineRequest =
  | { kind: 'usage' }
  | { kind: 'undo' }
  | { kind: 'refine'; mode: 'light' | 'full'; text: string }

export const parseArgs = (args: string): RefineRequest => {
  const trimmed = args.trim()
  if (trimmed === '') return { kind: 'usage' }
  if (trimmed === 'undo') return { kind: 'undo' }
  if (/^full\s/.test(trimmed)) {
    return { kind: 'refine', mode: 'full', text: trimmed.slice(4).trim() }
  }
  return { kind: 'refine', mode: 'light', text: trimmed }
}

export const buildSystem = (mode: 'light' | 'full'): string =>
  BASE_RULES + (mode === 'full' ? FULL_RULES : LIGHT_RULES)

export const buildPrompt = (raw: string, context: string): string =>
  `PROJECT_CONTEXT:\n${context === '' ? '(none found)' : context}\n\nRAW_PROMPT:\n${raw}`

export const clampContext = (parts: readonly string[]): string =>
  parts.filter(part => part.trim() !== '').join('\n\n---\n\n').slice(0, MAX_CONTEXT_CHARS)

type Mode = 'light' | 'full'

const MSG_FILLED =
  'Refined prompt is in the box. Edit it, then press Enter. (/refine undo restores yours)'
const MSG_FAILED = 'Refine failed; your text is unchanged.'
const MSG_EMPTY = 'Type a prompt in the box first, then press Refine.'

let lastOriginal: string | undefined
let isBusy = false

async function refineText($: EngineInterface, text: string, mode: Mode): Promise<string> {
  const parts = await Promise.all(CONTEXT_FILES.map(path => $.fs.read(path).catch(() => '')))
  const result = await $.model.complete({
    model: REFINER_MODEL,
    system: buildSystem(mode),
    prompt: buildPrompt(text, clampContext(parts)),
    effort: 'low',
    timeoutMs: TIMEOUT_MS,
  })

  if (!result.isAnswered || result.text.trim() === '') return MSG_FAILED

  const refined = result.text.trim()
  lastOriginal = text
  const filled = await $.prompt.fill({ text: refined })

  return filled.isFilled ? MSG_FILLED : `Could not fill the prompt box. Refined prompt:\n${refined}`
}

async function undo($: EngineInterface): Promise<string> {
  if (lastOriginal === undefined) return 'Nothing to undo.'
  await $.prompt.fill({ text: lastOriginal })

  return 'Restored your original text.'
}

async function refineBox($: EngineInterface, mode: Mode): Promise<void> {
  if (isBusy) return
  isBusy = true
  try {
    const { text } = await $.prompt.read()
    if (text.trim() === '') {
      $.ui.toast(MSG_EMPTY)
      return
    }
    $.ui.status('Refining prompt...')
    $.ui.toast(await refineText($, text, mode))
  } finally {
    isBusy = false
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Rewrite a rough prompt using project rules; review it in the prompt box',
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const request = parseArgs(e.args)

    if (request.kind === 'undo') return { text: await undo($) }
    if (request.kind === 'usage' || request.text === '') return { text: USAGE }

    return { text: await refineText($, request.text, request.mode) }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>Prompt: </Text>
        <Button key="refine" label="Refine" onPress={() => refineBox($, 'light')} />
        <Text> </Text>
        <Button key="refine-full" label="Refine full" onPress={() => refineBox($, 'full')} />
        <Text> </Text>
        <Button key="undo" label="Undo" onPress={async () => $.ui.toast(await undo($))} />
      </Box>
    )
  })
}
