import { extractCoordsFromSuggestion, type Coords } from '../geo/rideCoords';

export interface NormalizedSuggestion {
  mainText: string;
  secondaryText: string;
  fullText: string;
  placeId: string | null;
  coords: Coords | null;
}

export function normalizeSuggestion(suggestion: any, fallbackLabel: string): NormalizedSuggestion {
  const structured = suggestion?.structured_formatting || suggestion?.structuredFormatting;
  const descriptor =
    suggestion?.description ||
    suggestion?.place_name ||
    suggestion?.display_name ||
    suggestion?.title ||
    suggestion?.name ||
    suggestion?.text ||
    suggestion?.label;

  const mainText =
    structured?.main_text ||
    suggestion?.main_text ||
    suggestion?.primary_text ||
    suggestion?.text ||
    suggestion?.title ||
    suggestion?.name ||
    descriptor ||
    fallbackLabel;

  const secondaryText =
    structured?.secondary_text ||
    suggestion?.secondary_text ||
    suggestion?.secondary ||
    suggestion?.subtitle ||
    suggestion?.vicinity ||
    suggestion?.formatted_address ||
    suggestion?.address ||
    suggestion?.place_address ||
    '';

  const fullText = descriptor || (secondaryText ? `${mainText}, ${secondaryText}` : mainText);
  const placeId = suggestion?.place_id || suggestion?.placeId || suggestion?.id || suggestion?.reference || null;
  const coords = extractCoordsFromSuggestion(suggestion);

  return { mainText, secondaryText, fullText, placeId, coords };
}
