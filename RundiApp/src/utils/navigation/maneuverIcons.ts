// Mapeo (type, modifier) OSRM → ícono MaterialIcons + key i18n + fallback ES.
import type { NavStep } from './osrmNavRoute';

export type NavIconName =
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'turn-slight-left'
  | 'turn-slight-right'
  | 'turn-sharp-left'
  | 'turn-sharp-right'
  | 'u-turn-left'
  | 'u-turn-right'
  | 'roundabout-left'
  | 'roundabout-right'
  | 'merge'
  | 'fork-left'
  | 'fork-right'
  | 'navigation'
  | 'place'
  | 'flag';

type StepLike = Pick<NavStep, 'type' | 'modifier'> | null | undefined;

const isLeft = (modifier: string) => modifier.includes('left');

export function maneuverIcon(step: StepLike): NavIconName {
  if (!step) return 'navigation';
  const modifier = step.modifier ?? '';

  switch (step.type) {
    case 'depart':
      return 'navigation';
    case 'arrive':
      return 'place';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
    case 'exit roundabout':
    case 'exit rotary':
      return isLeft(modifier) ? 'roundabout-left' : 'roundabout-right';
    case 'merge':
      return 'merge';
    case 'fork':
      return isLeft(modifier) ? 'fork-left' : 'fork-right';
    default:
      break;
  }

  if (modifier === 'uturn') return 'u-turn-left';
  if (modifier.includes('sharp'))
    return isLeft(modifier) ? 'turn-sharp-left' : 'turn-sharp-right';
  if (modifier.includes('slight'))
    return isLeft(modifier) ? 'turn-slight-left' : 'turn-slight-right';
  if (isLeft(modifier)) return 'turn-left';
  if (modifier.includes('right')) return 'turn-right';
  return 'straight';
}

/** Key i18n: driver.activeRide.nav.maneuver.* (interpolación {{street}}). */
export function maneuverTextKey(step: StepLike): string {
  if (!step) return 'driver.activeRide.nav.maneuver.continue';
  const modifier = step.modifier ?? '';
  let base: string;
  switch (step.type) {
    case 'depart':
      base = 'depart';
      break;
    case 'arrive':
      base = isLeft(modifier)
        ? 'arrive_left'
        : modifier.includes('right')
          ? 'arrive_right'
          : 'arrive';
      break;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      base = 'roundabout';
      break;
    case 'exit roundabout':
    case 'exit rotary':
      base = 'exit_roundabout';
      break;
    case 'merge':
      base = 'merge';
      break;
    case 'fork':
      base = isLeft(modifier) ? 'fork_left' : 'fork_right';
      break;
    case 'notification':
      base = 'continue';
      break;
    default:
      if (modifier === 'uturn') base = 'uturn';
      else if (modifier.includes('sharp'))
        base = isLeft(modifier) ? 'sharp_left' : 'sharp_right';
      else if (modifier.includes('slight'))
        base = isLeft(modifier) ? 'slight_left' : 'slight_right';
      else if (isLeft(modifier)) base = 'turn_left';
      else if (modifier.includes('right')) base = 'turn_right';
      else base = 'continue';
  }
  return `driver.activeRide.nav.maneuver.${base}`;
}

/** Texto ES de respaldo: se usa si la key i18n aún no existe. */
export function maneuverFallbackEs(step: StepLike): string {
  const modifier = step?.modifier ?? '';
  const side = isLeft(modifier) ? 'la izquierda' : 'la derecha';

  switch (step?.type) {
    case 'depart':
      return 'Comienza a conducir';
    case 'arrive':
      return isLeft(modifier) || modifier.includes('right')
        ? `Destino a ${side}`
        : 'Has llegado a tu destino';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return 'En la rotonda';
    case 'exit roundabout':
    case 'exit rotary':
      return 'Sal de la rotonda';
    case 'merge':
      return 'Incorpórate';
    case 'fork':
      return `Mantente a ${side}`;
    default:
      break;
  }

  if (modifier === 'uturn') return 'Haz un giro en U';
  if (modifier.includes('sharp')) return `Gira pronunciado a ${side}`;
  if (modifier.includes('slight')) return `Gira levemente a ${side}`;
  if (isLeft(modifier)) return 'Gira a la izquierda';
  if (modifier.includes('right')) return 'Gira a la derecha';
  if (
    step?.type === 'new name' ||
    step?.type === 'continue' ||
    step?.type === 'notification'
  )
    return 'Continúa';
  return 'Sigue la ruta';
}
