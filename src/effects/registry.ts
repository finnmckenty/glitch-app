import type { EffectDefinition, EffectCategory } from './types'

const registry = new Map<string, EffectDefinition>()

export function registerEffect(def: EffectDefinition): void {
  registry.set(def.id, def)
}

export function getEffect(id: string): EffectDefinition | undefined {
  return registry.get(id)
}

export function getAllEffects(): EffectDefinition[] {
  return Array.from(registry.values())
}

export function getEffectsByCategory(category: EffectCategory): EffectDefinition[] {
  return getAllEffects().filter((e) => e.category === category)
}
