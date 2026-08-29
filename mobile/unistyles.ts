import { StyleSheet } from 'react-native-unistyles';

const lightTheme = {
  colors: {
    background: '#F7F7F5',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F2F0',
    text: '#181A19',
    textMuted: '#707571',
    border: '#E4E6E2',
    primary: '#4B66D6',
    primarySoft: '#EEF1FF',
    success: '#35A46B',
    warning: '#E1AA24',
    high: '#E7832D',
    critical: '#E4524B',
    purple: '#7A63D8',
    shadow: '#1E2521',
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    pill: 999,
  },
  spacing: (value: number) => value * 4,
} as const;

const breakpoints = {
  xs: 0,
  sm: 360,
  md: 430,
  lg: 768,
} as const;

type AppThemes = { light: typeof lightTheme };
type AppBreakpoints = typeof breakpoints;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: { light: lightTheme },
  breakpoints,
  settings: { initialTheme: 'light' },
});
