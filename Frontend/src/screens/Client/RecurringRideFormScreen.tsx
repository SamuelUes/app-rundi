import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useAddressSearch } from '../../hooks/client/SearchRideScreen/useAddressSearch';
import {
  useRecurringRideForm,
  type RecurringRideFieldTarget,
} from '../../hooks/client/useRecurringRideForm';
import { saveRecurringRide, MAX_RECURRING_RIDES } from '../../services/recurringRidesService';
import mapsService from '../../services/mapsService';
import alertService from '../../services/alertService';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../utils/suggestions';
import type { Coords } from '../../utils/rideCoords';
import type { RecurringRide, RecurringRideVehicleType } from '../../types/recurringRide';

const { MANUAL_ORIGIN } = MAP_ICONS;
const FALLBACK = { latitude: 12.1364, longitude: -86.2514 };

export default function RecurringRideFormScreen({ navigation, route }: any) {
  const editingRide: RecurringRide | undefined = route?.params?.ride;
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tr = useCallback(
    (path: string, options?: Record<string, any>) => t(`shared.searchRide.${path}`, options),
    [t],
  );
  const rr = useCallback(
    (path: string, options?: Record<string, any>) => t(`client.recurringRides.${path}`, options),
    [t],
  );

  const form = useRecurringRideForm(editingRide);
  const {
    title, setTitle,
    originAddress, originCoords,
    destinationAddress, destinationCoords,
    extraStops,
    vehicleType, setVehicleType,
    designatedDriverMode, setDesignatedDriverMode,
    paymentMethod, setPaymentMethod,
    passengers, setPassengers,
    comment, setComment,
    routeCoordinates, estimatedDistance, estimatedDuration, calculatingRoute,
    applySelection, removeStop,
    buildInput, canSave,
    maxExtraStops,
  } = form;

  const [searchVisible, setSearchVisible] = useState(false);
  const [activeField, setActiveField] = useState<RecurringRideFieldTarget | null>(null);
  const [mapPickTarget, setMapPickTarget] = useState<RecurringRideFieldTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const {
    searchResults,
    searchLoading,
    setSearchLoading,
    searchError,
    setSearchError,
    reset: resetSearch,
  } = useAddressSearch(
    searchVisible,
    searchQuery,
    coords ?? originCoords,
    tr('defaults.locationFallback'),
    tr('labels.noResults'),
    tr('search.error'),
  );

  const openSearch = useCallback((target: RecurringRideFieldTarget) => {
    setActiveField(target);
    setSearchVisible(true);
    resetSearch();
    setSearchQuery('');
  }, [resetSearch]);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchError(null);
    resetSearch();
    setActiveField(null);
  }, [resetSearch, setSearchError]);

  const fieldLabel = useCallback(
    (target: RecurringRideFieldTarget | null) => {
      if (target === 'origin') return tr('defaults.origin');
      if (target === 'destination') return tr('defaults.destination');
      if (target === 'new-stop' || typeof target === 'number')
        return tr('mapSelection.newStopTitle', {
          index: typeof target === 'number' ? target + 1 : extraStops.length + 1,
        });
      return tr('search.inputLabel');
    },
    [tr, extraStops.length],
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: NormalizedSuggestion) => {
      const target = activeField ?? 'destination';
      try {
        setSearchLoading(true);
        let coordsValue = suggestion.coords;
        if (!coordsValue && suggestion.placeId) {
          coordsValue = (await mapsService.getPlaceDetails(suggestion.placeId)) || null;
        }
        if (!coordsValue) {
          alertService.showErrorAlert(tr('alerts.locationFetchFailed'));
          return;
        }
        applySelection(target, suggestion.fullText, coordsValue);
        closeSearch();
      } finally {
        setSearchLoading(false);
      }
    },
    [activeField, applySelection, closeSearch, setSearchLoading, tr],
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (!coords) return;
    applySelection(activeField ?? 'origin', tr('defaults.myLocation'), coords);
    closeSearch();
  }, [coords, activeField, applySelection, closeSearch, tr]);

  const handlePickOnMap = useCallback(() => {
    if (!activeField) return;
    setMapPickTarget(activeField);
    closeSearch();
  }, [activeField, closeSearch]);

  const handleMapPress = useCallback(
    async ({ latitude, longitude }: Coords) => {
      if (mapPickTarget == null) return;
      const target = mapPickTarget;
      setMapPickTarget(null);
      const address =
        (await mapsService.reverseGeocode({ latitude, longitude })) ||
        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      applySelection(target, address, { latitude, longitude });
    },
    [mapPickTarget, applySelection],
  );

  const handleSave = useCallback(async () => {
    const input = buildInput();
    if (!input) {
      alertService.showErrorAlert(rr('incompleteRoute'));
      return;
    }
    if (!user?.id || saving) return;
    setSaving(true);
    try {
      await saveRecurringRide(user.id, input);
      alertService.showSuccessAlert(rr('saved'), '');
      navigation.goBack();
    } catch (error: any) {
      if (String(error?.message || '').startsWith('MAX_RECURRING_RIDES')) {
        alertService.showInfoAlert(rr('limitReached', { max: MAX_RECURRING_RIDES }), '');
      } else {
        alertService.showErrorAlert(rr('saveError'));
      }
    } finally {
      setSaving(false);
    }
  }, [buildInput, user?.id, saving, rr, navigation]);

  const maxPassengers =
    vehicleType === 'moto' || (vehicleType === 'designated_driver' && designatedDriverMode === 'moto') ? 1 : 4;

  const originMarker = originCoords ?? undefined;
  const destinationMarker = destinationCoords ?? undefined;
  const extraStopMarkers = extraStops
    .filter((s) => s.coords)
    .map((s, index) => ({
      latitude: s.coords!.latitude,
      longitude: s.coords!.longitude,
      index,
      title: t('common.mapPins.extraStop', { index: index + 1 }),
      label: s.address || undefined,
    }));

  const searchPlaceholder =
    activeField === 'origin'
      ? tr('search.placeholderOrigin')
      : activeField === 'destination'
        ? tr('search.placeholderDestination')
        : tr('search.placeholderStop');

  const VEHICLE_ICONS: Record<RecurringRideVehicleType, keyof typeof MaterialIcons.glyphMap> = {
    moto: 'two-wheeler',
    auto: 'directions-car',
    designated_driver: 'person-pin',
  };

  return (
    <View style={styles.container}>
      <DynamicMap
        latitude={(originCoords || coords)?.latitude ?? FALLBACK.latitude}
        longitude={(originCoords || coords)?.longitude ?? FALLBACK.longitude}
        style={StyleSheet.absoluteFill}
        onMapPress={handleMapPress}
        originMarker={originMarker}
        destinationMarker={destinationMarker}
        extraStopMarkers={extraStopMarkers}
        routeCoordinates={routeCoordinates}
        originTitle={t('common.mapPins.origin')}
        originLabel={originAddress || undefined}
        destinationTitle={t('common.mapPins.destination')}
        destinationLabel={destinationAddress || undefined}
        showUserLocation={false}
        autoFitEnabled={!mapPickTarget}
        manualOriginIcon={MANUAL_ORIGIN}
      />

      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 12 }]}
        onPress={() => navigation?.goBack?.()}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>

      <View style={[styles.titlePill, { top: insets.top + 12 }]} pointerEvents="none">
        <Text style={styles.titlePillText} numberOfLines={1}>
          {editingRide ? rr('formTitleEdit') : rr('formTitleNew')}
        </Text>
      </View>

      {mapPickTarget != null && (
        <View style={[styles.mapPickBanner, { top: insets.top + 60 }]}>
          <MaterialIcons name="touch-app" size={15} color="#B38737" />
          <Text style={styles.mapPickText} numberOfLines={2}>
            {rr('mapPickHint')}
          </Text>
          <TouchableOpacity onPress={() => setMapPickTarget(null)}>
            <Text style={styles.mapPickCancel}>{tr('search.close')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route card */}
      <View style={[styles.routeCard, { top: insets.top + 60 }]}>
        <Pressable style={styles.routeRow} onPress={() => openSearch('origin')}>
          <MaterialIcons name="trip-origin" size={16} color="#4CAF50" />
          <Text style={[styles.routeRowText, !originAddress && styles.routeRowPlaceholder]} numberOfLines={1}>
            {originAddress || tr('labels.originPlaceholder')}
          </Text>
          <MaterialIcons name="edit" size={14} color={colors.textSecondary} />
        </Pressable>

        {extraStops.map((stop, index) => (
          <View key={`stop-${index}`} style={styles.routeRow}>
            <MaterialIcons name="more-vert" size={16} color="#B38737" />
            <Pressable style={styles.routeRowBody} onPress={() => openSearch(index)}>
              <Text style={[styles.routeRowText, !stop.address && styles.routeRowPlaceholder]} numberOfLines={1}>
                {stop.address || tr('labels.stopLabel', { index: index + 1 })}
              </Text>
            </Pressable>
            <TouchableOpacity onPress={() => removeStop(index)} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}

        <Pressable style={styles.routeRow} onPress={() => openSearch('destination')}>
          <MaterialIcons name="place" size={16} color="#E53935" />
          <Text style={[styles.routeRowText, !destinationAddress && styles.routeRowPlaceholder]} numberOfLines={1}>
            {destinationAddress || tr('labels.destinationPlaceholder')}
          </Text>
          <MaterialIcons name="edit" size={14} color={colors.textSecondary} />
        </Pressable>

        {extraStops.length < maxExtraStops && (
          <Pressable style={styles.addStopRow} onPress={() => openSearch('new-stop')}>
            <MaterialIcons name="add-circle-outline" size={15} color="#B38737" />
            <Text style={styles.addStopText}>{tr('accessibility.addExtraStop')}</Text>
          </Pressable>
        )}

        <View style={styles.routeMetaRow}>
          {calculatingRoute ? (
            <>
              <ActivityIndicator size="small" color="#B38737" />
              <Text style={styles.routeMetaText}>{rr('routeCalculating')}</Text>
            </>
          ) : estimatedDistance > 0 ? (
            <>
              <MaterialIcons name="route" size={14} color="#B38737" />
              <Text style={styles.routeMetaText}>
                {rr('routeInfo', { distance: estimatedDistance, duration: estimatedDuration })}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Bottom form */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.formWrap}>
        <ScrollView
          style={styles.formSheet}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>{rr('nameLabel')}</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder={rr('namePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            maxLength={40}
          />

          <Text style={styles.fieldLabel}>{rr('vehicleSection')}</Text>
          <View style={styles.chipsRow}>
            {(['moto', 'auto', 'designated_driver'] as RecurringRideVehicleType[]).map((type) => {
              const selected = vehicleType === type;
              return (
                <Pressable
                  key={type}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => {
                    setVehicleType(type);
                    if (type === 'moto') setPassengers(1);
                  }}
                  accessibilityRole="button"
                >
                  <MaterialIcons
                    name={VEHICLE_ICONS[type]}
                    size={15}
                    color={selected ? '#241A09' : colors.textSecondary}
                  />
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                    {tr(`vehicle.${type === 'designated_driver' ? 'designatedLabel' : `${type}Label`}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {vehicleType === 'designated_driver' && (
            <View style={styles.chipsRow}>
              {(['auto', 'moto'] as const).map((mode) => {
                const selected = designatedDriverMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}
                    onPress={() => {
                      setDesignatedDriverMode(mode);
                      if (mode === 'moto') setPassengers(1);
                    }}
                    accessibilityRole="button"
                  >
                    <MaterialIcons
                      name={mode === 'auto' ? 'directions-car' : 'two-wheeler'}
                      size={15}
                      color={selected ? '#241A09' : colors.textSecondary}
                    />
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                      {mode === 'auto' ? tr('vehicle.modeAuto') : tr('vehicle.modeMoto')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.fieldLabel}>{rr('paymentSection')}</Text>
          <View style={styles.chipsRow}>
            {(['cash', 'card'] as const).map((method) => {
              const selected = paymentMethod === method;
              return (
                <Pressable
                  key={method}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => setPaymentMethod(method)}
                  accessibilityRole="button"
                >
                  <MaterialIcons
                    name={method === 'cash' ? 'payments' : 'credit-card'}
                    size={15}
                    color={selected ? '#241A09' : colors.textSecondary}
                  />
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                    {rr(method)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{rr('passengersLabel')}</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepperButton, passengers <= 1 && styles.stepperButtonDisabled]}
              onPress={() => setPassengers(Math.max(1, passengers - 1))}
              disabled={passengers <= 1}
              accessibilityRole="button"
            >
              <MaterialIcons name="remove" size={18} color={colors.text} />
            </Pressable>
            <Text style={styles.stepperValue}>{passengers}</Text>
            <Pressable
              style={[styles.stepperButton, passengers >= maxPassengers && styles.stepperButtonDisabled]}
              onPress={() => setPassengers(Math.min(maxPassengers, passengers + 1))}
              disabled={passengers >= maxPassengers}
              accessibilityRole="button"
            >
              <MaterialIcons name="add" size={18} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>{rr('commentLabel')}</Text>
          <TextInput
            style={[styles.textInput, styles.commentInput]}
            value={comment}
            onChangeText={setComment}
            placeholder={rr('commentPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={160}
          />

          <Pressable
            style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#241A09" />
            ) : (
              <MaterialIcons name="bookmark-added" size={18} color="#241A09" />
            )}
            <Text style={styles.saveButtonText}>{rr('save')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Search overlay */}
      {searchVisible && (
        <View style={styles.searchOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSearch} />
          <View style={[styles.searchCard, { marginTop: insets.top + 56 }]}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>{fieldLabel(activeField)}</Text>
              <TouchableOpacity onPress={closeSearch} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <MaterialIcons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textSecondary}
                autoFocus
                autoCorrect={false}
              />
            </View>
            <View style={styles.searchActionsRow}>
              <Pressable style={styles.searchActionChip} onPress={handleUseCurrentLocation}>
                <MaterialIcons name="my-location" size={15} color="#B38737" />
                <Text style={styles.searchActionText}>{tr('search.useCurrentLocation')}</Text>
              </Pressable>
              <Pressable style={styles.searchActionChip} onPress={handlePickOnMap}>
                <MaterialIcons name="map" size={15} color="#B38737" />
                <Text style={styles.searchActionText}>{tr('search.pickOnMap')}</Text>
              </Pressable>
            </View>
            {searchLoading && (
              <View style={styles.searchStatusRow}>
                <ActivityIndicator size="small" color="#B38737" />
                <Text style={styles.searchStatusText}>{tr('search.loading')}</Text>
              </View>
            )}
            {!!searchError && !searchLoading && (
              <Text style={styles.searchErrorText}>{searchError}</Text>
            )}
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.searchResults}>
              {searchResults.map((item, index) => (
                <Pressable
                  key={`${item.placeId ?? 's'}-${index}`}
                  style={styles.searchResultItem}
                  onPress={() => void handleSelectSuggestion(item)}
                >
                  <MaterialIcons name="place" size={18} color="#B38737" />
                  <View style={styles.searchResultBody}>
                    <Text style={styles.searchResultMain} numberOfLines={1}>{item.mainText}</Text>
                    {!!item.secondaryText && (
                      <Text style={styles.searchResultSecondary} numberOfLines={1}>{item.secondaryText}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    backButton: {
      position: 'absolute',
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
      zIndex: 30,
      elevation: 8,
    },
    titlePill: {
      position: 'absolute',
      alignSelf: 'center',
      left: 70,
      right: 70,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
      zIndex: 25,
    },
    titlePillText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    mapPickBanner: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(43,32,7,0.95)' : 'rgba(255,247,230,0.97)',
      borderWidth: 1,
      borderColor: 'rgba(179,135,55,0.4)',
      zIndex: 30,
    },
    mapPickText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: isDark ? '#FFD666' : '#8A5800' },
    mapPickCancel: { fontSize: 12.5, fontWeight: '700', color: '#B38737' },
    routeCard: {
      position: 'absolute',
      left: 16,
      right: 16,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: isDark ? 'rgba(24,20,17,0.94)' : 'rgba(255,255,255,0.96)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.12,
      shadowRadius: 12,
      elevation: 10,
      zIndex: 20,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
    },
    routeRowBody: { flex: 1 },
    routeRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    routeRowPlaceholder: { color: colors.textSecondary, fontWeight: '500' },
    addStopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingLeft: 2,
    },
    addStopText: { fontSize: 13, fontWeight: '700', color: '#B38737' },
    routeMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 6,
      paddingBottom: 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
      minHeight: 24,
    },
    routeMetaText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    formWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
    },
    formSheet: {
      maxHeight: 420,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: isDark ? 'rgba(24,20,17,0.97)' : 'rgba(255,255,255,0.98)',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: isDark ? 0.4 : 0.14,
      shadowRadius: 16,
      elevation: 16,
    },
    formContent: { padding: 18, paddingBottom: 28 },
    fieldLabel: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
      marginTop: 14,
    },
    textInput: {
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
    },
    commentInput: { minHeight: 60, textAlignVertical: 'top' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
    },
    optionChipSelected: {
      backgroundColor: '#B38737',
      borderColor: '#B38737',
    },
    optionChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
    optionChipTextSelected: { color: '#241A09' },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepperButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.06)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
    },
    stepperButtonDisabled: { opacity: 0.4 },
    stepperValue: { fontSize: 17, fontWeight: '800', color: colors.text, minWidth: 24, textAlign: 'center' },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 54,
      borderRadius: 999,
      backgroundColor: '#B38737',
      marginTop: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 10,
    },
    saveButtonDisabled: { opacity: 0.45 },
    saveButtonText: { fontSize: 16, fontWeight: '800', color: '#241A09' },
    searchOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      zIndex: 40,
    },
    searchCard: {
      marginHorizontal: 16,
      borderRadius: 22,
      padding: 16,
      maxHeight: '78%',
      backgroundColor: isDark ? 'rgba(24,20,17,0.98)' : '#FFFFFF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 20,
    },
    searchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    searchTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    searchInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
    },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, padding: 0 },
    searchActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    searchActionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(43,32,7,0.8)' : 'rgba(255,247,230,0.9)',
      borderWidth: 1,
      borderColor: 'rgba(179,135,55,0.35)',
    },
    searchActionText: { fontSize: 12.5, fontWeight: '700', color: isDark ? '#FFD666' : '#8A5800' },
    searchStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    searchStatusText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    searchErrorText: { fontSize: 13, fontWeight: '600', color: '#C62828', marginTop: 12 },
    searchResults: { marginTop: 8 },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.06)',
    },
    searchResultBody: { flex: 1 },
    searchResultMain: { fontSize: 14, fontWeight: '700', color: colors.text },
    searchResultSecondary: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: 1 },
  });
