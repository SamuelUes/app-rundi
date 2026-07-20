import { useCallback, useEffect, useState } from 'react';
import mapsService from '../../../services/mapsService';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../../utils/suggestions';
import type { Coords } from '../../../utils/rideCoords';

export function useAddressSearch(
  visible: boolean,
  query: string,
  coords: Coords | null | undefined,
  fallbackLabel: string,
  noResultsLabel: string,
  errorLabel: string,
) {
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NormalizedSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setDebouncedSearch('');
      return;
    }

    const handler = setTimeout(() => {
      setDebouncedSearch(query.trim());
    }, 450);

    return () => clearTimeout(handler);
  }, [query, visible]);

  useEffect(() => {
    if (!visible || debouncedSearch.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      if (debouncedSearch.length === 0) {
        setSearchError(null);
      }
      return;
    }

    let cancelled = false;
    const fetchSuggestions = async () => {
      try {
        setSearchLoading(true);
        const results = await mapsService.autocomplete(debouncedSearch, coords ?? undefined);
        if (!cancelled) {
          setSearchResults(results.map((item) => normalizeSuggestion(item, fallbackLabel)));
          setSearchError(results.length === 0 ? noResultsLabel : null);
        }
      } catch (error) {
        console.warn('autocomplete failed', error);
        if (!cancelled) {
          setSearchError(errorLabel);
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };

    fetchSuggestions();
    return () => {
      cancelled = true;
    };
  }, [visible, debouncedSearch, coords, fallbackLabel, noResultsLabel, errorLabel]);

  const reset = useCallback(() => {
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
  }, []);

  return {
    searchResults,
    searchLoading,
    setSearchLoading,
    searchError,
    setSearchError,
    reset,
  };
}
