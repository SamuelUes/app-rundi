import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import { formatCoords, type Coords } from '../../../utils/rideCoords';
import type { NormalizedSuggestion } from '../../../utils/suggestions';
type TrFunction = (path: string, options?: Record<string, any>) => string;

interface SavedLocation {
  label: string;
  coords: Coords;
}

interface SearchRideSearchOverlayProps {
  selectionTitle: string;
  selectionDescription: string;
  isDestinationSelection: boolean;
  shouldHighlightMapAction: boolean;
  hasConfirmedDestination: boolean;
  searchQuery: string;
  searchLoading: boolean;
  searchError: string | null;
  searchResults: NormalizedSuggestion[];
  favoriteLocations: SavedLocation[];
  recentLocations: SavedLocation[];
  activeSelection: any;
  colors: any;
  onSetSearchQuery: (text: string) => void;
  onSetSearchError: (error: string | null) => void;
  onClose: () => void;
  onUseCurrentLocation: () => void;
  onPickFromMap: () => void;
  onSelectSuggestion: (suggestion: NormalizedSuggestion) => void;
  onSelectSavedLocation: (location: SavedLocation) => void;
  styles: any;
  tr: TrFunction;
}

export function SearchRideSearchOverlay({
  selectionTitle,
  selectionDescription,
  isDestinationSelection,
  shouldHighlightMapAction,
  hasConfirmedDestination,
  searchQuery,
  searchLoading,
  searchError,
  searchResults,
  favoriteLocations,
  recentLocations,
  activeSelection,
  colors,
  onSetSearchQuery,
  onSetSearchError,
  onClose,
  onUseCurrentLocation,
  onPickFromMap,
  onSelectSuggestion,
  onSelectSavedLocation,
  styles,
  tr,
}: SearchRideSearchOverlayProps) {
  return (
    <View style={styles.searchOverlay}>
      <View style={styles.searchCard}>
        <View style={styles.searchHeader}>
          <View style={styles.searchHeaderTextBlock}>
            <Text style={styles.searchTitle}>{selectionTitle}</Text>
            <Text style={styles.searchDescription}>{selectionDescription}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.searchCloseButton}>
            <Text style={styles.searchCloseText}>{tr('search.close')}</Text>
          </TouchableOpacity>
        </View>

        {isDestinationSelection ? (
          <View style={styles.destinationGuidanceCard}>
            <Text style={styles.destinationGuidanceTitle}>{tr('search.destinationGuidanceTitle')}</Text>
            <Text style={styles.destinationGuidanceText}>{tr('search.destinationGuidanceBody')}</Text>
            <View style={styles.destinationGuidanceSteps}>
              <View style={styles.destinationGuidanceStepPill}>
                <Text style={styles.destinationGuidanceStepText}>{tr('search.destinationGuidanceStep1')}</Text>
              </View>
              <View style={styles.destinationGuidanceStepPill}>
                <Text style={styles.destinationGuidanceStepText}>{tr('search.destinationGuidanceStep2')}</Text>
              </View>
            </View>
            {hasConfirmedDestination ? (
              <View style={styles.destinationConfirmedPill}>
                <Text style={styles.destinationConfirmedText}>{tr('search.destinationConfirmed')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchInputLabel}>{tr('search.inputLabel')}</Text>
          {isDestinationSelection ? (
            <Text style={styles.searchInputHelper}>{tr('search.placeholderDestinationReference')}</Text>
          ) : null}
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={(() => {
                if (activeSelection === 'origin') return tr('search.placeholderOrigin');
                if (activeSelection === 'destination') return tr('search.placeholderDestinationReference');
                if (activeSelection === 'new-stop' || typeof activeSelection === 'number') {
                  return tr('search.placeholderStop');
                }
                return tr('search.placeholderGeneric');
              })()}
              placeholderTextColor={colors.textSecondary || '#999'}
              value={searchQuery}
              onChangeText={(text) => {
                onSetSearchQuery(text);
                onSetSearchError(null);
              }}
              autoFocus
              returnKeyType="search"
            />
          </View>
        </View>

        <View style={styles.searchActionsRow}>
          <TouchableOpacity
            style={[styles.searchActionChip, !shouldHighlightMapAction && styles.searchActionPrimary]}
            onPress={onUseCurrentLocation}
          >
            <Text style={[styles.searchActionText, !shouldHighlightMapAction && styles.searchActionTextPrimary]}>
              {tr('search.useCurrentLocation')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.searchActionChip, shouldHighlightMapAction && styles.searchActionPrimary]} onPress={onPickFromMap}>
            <Text style={[styles.searchActionText, shouldHighlightMapAction && styles.searchActionTextPrimary]}>{tr('search.pickOnMap')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.searchScroll} keyboardShouldPersistTaps="handled">
          {favoriteLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedSectionTitle}>{tr('labels.favorites')}</Text>
              {favoriteLocations.map((location, index) => (
                <TouchableOpacity
                  key={`fav-${index}`}
                  style={styles.savedItem}
                  onPress={() => onSelectSavedLocation(location)}
                >
                  <Text style={styles.savedItemLabel}>{location.label}</Text>
                  <Text style={styles.savedItemCoords}>{formatCoords(location.coords)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {recentLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedSectionTitle}>{tr('labels.recent')}</Text>
              {recentLocations.map((location, index) => (
                <TouchableOpacity
                  key={`recent-${index}`}
                  style={styles.savedItem}
                  onPress={() => onSelectSavedLocation(location)}
                >
                  <Text style={styles.savedItemLabel}>{location.label}</Text>
                  <Text style={styles.savedItemCoords}>{formatCoords(location.coords)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.searchResultsSection}>
            {searchLoading && (
              <View style={styles.searchLoadingRow}>
                <LoadingIcon size={20} color={colors.primary || '#b38737'} />
                <Text style={styles.searchLoadingText}>{tr('search.loading')}</Text>
              </View>
            )}

            {!searchLoading && searchError ? (
              <Text style={styles.searchErrorText}>{searchError}</Text>
            ) : null}

            {searchResults.map((suggestion, index) => (
              <TouchableOpacity
                key={`result-${index}`}
                style={styles.searchResultItem}
                onPress={() => onSelectSuggestion(suggestion)}
              >
                <Text style={styles.searchResultMain}>{suggestion.mainText}</Text>
                {suggestion.secondaryText ? (
                  <Text style={styles.searchResultSecondary}>{suggestion.secondaryText}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
