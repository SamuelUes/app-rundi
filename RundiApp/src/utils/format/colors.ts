/**
 * Fold an opacity multiplier into a color string.
 *
 * Soporta '#rgb', '#rrggbb', '#rrggbbaa', 'rgb()' y 'rgba()'. Si el color ya
 * trae alpha, se multiplica por `opacity` (equivale a shadowColor ×
 * shadowOpacity del API legacy de sombras). Colores no parseables (nombres,
 * variables) se devuelven tal cual.
 */
export function withAlpha(color: string, opacity: number): string {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (h.length === 6 || h.length === 8) {
      const alpha = (h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1) * opacity;
      const channel = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
      return `${h.slice(0, 6)}${channel}`.replace(/^/, '#');
    }
    return color;
  }

  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    color.trim(),
  );
  if (rgb) {
    const alpha = (rgb[4] === undefined ? 1 : parseFloat(rgb[4])) * opacity;
    const clamped = Math.max(0, Math.min(1, alpha));
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${clamped})`;
  }

  return color;
}
