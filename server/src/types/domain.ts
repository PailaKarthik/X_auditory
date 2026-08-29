export type AttentionLevel = 'critical' | 'high' | 'medium' | 'low';

export const DIRECTIONS = [
  '12_o_clock',
  '1_o_clock',
  '2_o_clock',
  '3_o_clock',
  '4_o_clock',
  '5_o_clock',
  '6_o_clock',
  '7_o_clock',
  '8_o_clock',
  '9_o_clock',
  '10_o_clock',
  '11_o_clock',
  'unknown',
] as const;

export type Direction = (typeof DIRECTIONS)[number];

const DIRECTION_SET = new Set<string>(DIRECTIONS);

export function isDirection(value: string): value is Direction {
  return DIRECTION_SET.has(value);
}

export interface EventDefinition {
  key: string;
  label: string;
  category: 'environment' | 'transport' | 'emergency' | 'speech' | 'home';
  icon: string;
  defaultAttention: AttentionLevel;
}
