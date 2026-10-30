import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import { formatCoords, type Coords } from '../../../utils/rideCoords';
import type { NormalizedSuggestion } from '../../../utils/suggestions';
import { RideIcon, type RideIconSet } from './SearchRideVehicleOptions';
type TrFunction = (path: string, options?: Record<string, any>) => string;

interface SavedLocation {
  label: string;
  coords: Coords;
}

interface SearchRideSearchOverlayProps {
  selectionTitle: string;
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
  topInset?: number;
  onSetSearchQuery: (text: string) => void;
  onSetSearchError: (error: string | null) => void;
  onClose: () => void;
  onUseCurrentLocation: () => void;
  onPickFromMap: () => void;
  onSelectSuggestion: (suggestion: NormalizedSuggestion) => void;
  onSelectSavedLocation: (location: SavedLocation) => void;
  styles: any;
  tr: TrFunction;
  iconSet?: RideIconSet;
}

export function SearchRideSearchOverlay({
  selectionTitle,
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
  topInset = 0,
  onSetSearchQuery,
  onSetSearchError,
  onClose,
  onUseCurrentLocation,
  onPickFromMap,
  onSelectSuggestion,
  onSelectSavedLocation,
  styles,
  tr,
  iconSet,
}: SearchRideSearchOverlayProps) {
  const metaColor = colors.textSecondary || '#999';
  const accentColor = colors.primary || '#b38737';
  const successColor = colors.success || '#4caf50';

  const renderSavedItem = (location: SavedLocation, index: number, keyPrefix: string, icon: 'star' | 'history') => (
    <TouchableOpacity
      key={`${keyPrefix}-${index}`}
      style={styles.savedItem}
      onPress={() => onSelectSavedLocation(location)}
      accessibilityRole="button"
    >
      <RideIcon name={icon} iconSet={iconSet} size={17} color={accentColor} />
      <View style={styles.searchResultBody}>
        <Text style={styles.searchResultMain} numberOfLines={1}>
          {location.label}
        </Text>
        <Text style={styles.searchResultSecondary} numberOfLines={1}>
          {formatCoords(location.coords)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.searchOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.searchCard, { marginTop: topInset + 56 }]}>
        <View style={styles.searchHeader}>
          <Text style={styles.searchTitle} numberOfLines={1}>
            {selectionTitle}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('search.close')}
          >
            <RideIcon name="close" iconSet={iconSet} size={20} color={colors.text || '#111'} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchInputWrapper}>
          <RideIcon name="search" iconSet={iconSet} size={18} color={metaColor} />
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
            placeholderTextColor={metaColor}
            value={searchQuery}
            onChangeText={(text) => {
              onSetSearchQuery(text);
              onSetSearchError(null);
            }}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <View style={styles.searchActionsRow}>
          <TouchableOpacity
            style={[styles.searchActionChip, shouldHighlightMapAction && styles.searchActionChipPrimary]}
            onPress={onPickFromMap}
            accessibilityRole="button"
          >
            <RideIcon
              name="map"
              iconSet={iconSet}
              size={15}
              color={shouldHighlightMapAction ? '#FFFFFF' : accentColor}
            />
            <Text
              style={[styles.searchActionText, shouldHighlightMapAction && styles.searchActionTextPrimary]}
              numberOfLines={1}
            >
              {tr('search.pickOnMap')}
            </Text>
          </TouchableOpacity>

           <TouchableOpacity
            style={[styles.searchActionChip, !shouldHighlightMapAction && styles.searchActionChipPrimary]}
            onPress={onUseCurrentLocation}
            accessibilityRole="button"
          >
            <RideIcon
              name="my-location"
              iconSet={iconSet}
              size={15}
              color={shouldHighlightMapAction ? accentColor : '#FFFFFF'}
            />
            <Text
              style={[styles.searchActionText, !shouldHighlightMapAction && styles.searchActionTextPrimary]}
              numberOfLines={1}
            >
              {tr('search.useCurrentLocation')}
            </Text>
          </TouchableOpacity>
        </View>

        {isDestinationSelection && hasConfirmedDestination ? (
          <View style={styles.searchConfirmedRow}>
            <RideIcon name="check-circle" iconSet={iconSet} size={14} color={successColor} />
            <Text style={[styles.searchConfirmedText, { color: successColor }]} numberOfLines={1}>
              {tr('search.destinationConfirmed')}
            </Text>
          </View>
        ) : null}

        {searchLoading ? (
          <View style={styles.searchStatusRow}>
            <LoadingIcon size={16} color={accentColor} />
            <Text style={styles.searchStatusText}>{tr('search.loading')}</Text>
          </View>
        ) : null}

        {!searchLoading && searchError ? (
          <Text style={styles.searchErrorText}>{searchError}</Text>
        ) : null}

        <ScrollView style={styles.searchScroll} keyboardShouldPersistTaps="handled">
          {favoriteLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedSectionTitle}>{tr('labels.favorites')}</Text>
              {favoriteLocations.map((location, index) => renderSavedItem(location, index, 'fav', 'star'))}
            </View>
          )}

          {recentLocations.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedSectionTitle}>{tr('labels.recent')}</Text>
              {recentLocations.map((location, index) => renderSavedItem(location, index, 'recent', 'history'))}
            </View>
          )}

          <View style={styles.searchResultsSection}>
            {searchResults.map((suggestion, index) => (
              <TouchableOpacity
                key={`result-${index}`}
                style={styles.searchResultItem}
                onPress={() => onSelectSuggestion(suggestion)}
                accessibilityRole="button"
              >
                <RideIcon name="place" iconSet={iconSet} size={18} color={accentColor} />
                <View style={styles.searchResultBody}>
                  <Text style={styles.searchResultMain} numberOfLines={1}>
                    {suggestion.mainText}
                  </Text>
                  {suggestion.secondaryText ? (
                    <Text style={styles.searchResultSecondary} numberOfLines={1}>
                      {suggestion.secondaryText}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
