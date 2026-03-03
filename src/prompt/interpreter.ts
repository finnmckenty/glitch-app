import { getAllEffects } from '../effects/registry'
import type { EffectInstance, EffectParamDef } from '../effects/types'
import { uid } from '../utils/math'

export interface PromptInterpretation {
  effects: Array<{
    effectId: string
    params: Record<string, unknown>
  }>
  explanation: string
}

function buildSystemPrompt(): string {
  const effects = getAllEffects()
  const effectDocs = effects.map((e) => {
    const params = e.paramDefs.map((p: EffectParamDef) => {
      let desc = `${p.key} (${p.type}): ${p.semanticHint || p.label}`
      if (p.type === 'number') desc += ` [${p.min}-${p.max}]`
      if (p.type === 'select') desc += ` options: ${p.options?.map((o) => `${o.value}="${o.label}"`).join(', ')}`
      return desc
    })
    return `- ${e.id}: ${e.description}\n  params: ${params.join('; ')}`
  })

  return `You are a parameter interpreter for a glitch art application.

Given a creative direction prompt, output a JSON object with:
- "effects": array of { "effectId": string, "params": { key: value } }
- "explanation": brief description of what you did

Available effects:
${effectDocs.join('\n')}

Rules:
- Only use effectIds from the list above
- Keep param values within their min/max ranges
- Choose 2-6 effects that best match the aesthetic described
- Be creative — combine effects in interesting ways
- For animated effects, set speed > 0 unless the user wants static
- Return ONLY valid JSON, no markdown or extra text`
}

export async function interpretPrompt(
  prompt: string,
  apiKey: string
): Promise<PromptInterpretation> {
  const systemPrompt = buildSystemPrompt()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error: ${response.status} ${err}`)
  }

  const data = await response.json()
  const text = data.content[0].text

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  const parsed = JSON.parse(jsonMatch[0]) as PromptInterpretation

  // Validate effect IDs
  const validEffects = new Set(getAllEffects().map((e) => e.id))
  parsed.effects = parsed.effects.filter((e) => validEffects.has(e.effectId))

  return parsed
}

export function interpretationToChain(interpretation: PromptInterpretation): EffectInstance[] {
  return interpretation.effects.map((eff) => ({
    id: uid(),
    effectId: eff.effectId,
    params: eff.params,
    enabled: true,
    opacity: 1,
    blendMode: 'normal' as const,
  }))
}
