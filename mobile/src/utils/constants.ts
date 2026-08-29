import type { AttentionLevel } from '@/src/types/domain';

export const COLORS: Record<AttentionLevel, string> = {
  critical: '#E4524B',
  high: '#E7832D',
  medium: '#E1AA24',
  low: '#35A46B',
};

export const DIRECTION_LABELS: Record<string, string> = {
  '12_o_clock': "12 o'clock",
  '1_o_clock': "1 o'clock",
  '2_o_clock': "2 o'clock",
  '3_o_clock': "3 o'clock",
  '4_o_clock': "4 o'clock",
  '5_o_clock': "5 o'clock",
  '6_o_clock': "6 o'clock",
  '7_o_clock': "7 o'clock",
  '8_o_clock': "8 o'clock",
  '9_o_clock': "9 o'clock",
  '10_o_clock': "10 o'clock",
  '11_o_clock': "11 o'clock",
  unknown: 'Unknown direction',
};
