import { colors } from './colors';

export const theme = {
  colors,
  spacing: (n: number) => n * 8,
  radius: { sm: 6, md: 8, lg: 12 },
};
export type Theme = typeof theme;
