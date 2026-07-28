/**
 * Design system shared with the web test console and the project brief:
 * kraft/paper warm tones, deep teal as the only primary/interactive color,
 * red/orange reserved strictly for destructive actions.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2a231c',
    textSecondary: '#6b5d4c',
    background: '#f3ead9',
    backgroundElement: '#fbf6ec',
    backgroundSelected: '#e4eeea',
    border: '#d9c7a6',
    primary: '#0e5b54',
    primaryStrong: '#08403b',
    destructive: '#b23a18',
    destructiveSoft: '#f6e3da',
    success: '#2f7a4f',
    successSoft: '#e2eee4',
  },
  dark: {
    text: '#ede3d0',
    textSecondary: '#b7a98f',
    background: '#1e1a15',
    backgroundElement: '#26211a',
    backgroundSelected: '#20322d',
    border: '#4a4030',
    primary: '#2fa79a',
    primaryStrong: '#58c4b6',
    destructive: '#e2653d',
    destructiveSoft: '#3a271f',
    success: '#4caf7d',
    successSoft: '#223229',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    display: 'system-ui',
    body: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    display: 'sans-serif-condensed',
    body: 'normal',
    mono: 'monospace',
  },
  web: {
    display: 'var(--font-display)',
    body: 'var(--font-body)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 6,
  medium: 10,
  large: 16,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
