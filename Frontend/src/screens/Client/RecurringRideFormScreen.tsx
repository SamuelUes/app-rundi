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
  Image,
} from 'react-native';
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
import { RRIcon } from '../../components/client/recurringRides/RRIcon';
import mapsService from '../../services/mapsService';
import alertService from '../../services/alertService';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../utils/suggestions';
import type { Coords } from '../../utils/rideCoords';
import type { RecurringRide, RecurringRideVehicleType } from '../../types/recurringRide';

const { MANUAL_ORIGIN } = MAP_ICONS;
const FALLBACK = { latitude: 12.1364, longitude: -86.2514 };
const ORIGIN_PIN_IMG = require('../../assets/icons/origin_marker/origin_marker.png');
const DEST_PIN_IMG = require('../../assets/icons/select-final-destination/selectfinaldestination.png');
const STOP_PIN_IMG = require('../../assets/icons/select-extra-destination/selectextradestination_2x.png');

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
  const [formCollapsed, setFormCollapsed] = useState(false);
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
    setFormCollapsed(true);
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
      setFormCollapsed(false);
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
      console.warn('[recurringRides] save failed', error);
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

  const mutedIconColor = isDark ? 'rgba(245,241,234,0.7)' : colors.textSecondary;
  const accent = isDark ? colors.SecondBorder : '#B38737';
  const accentInk = isDark ? '#FFFFFF' : '#241A09';

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
        <RRIcon id="back" size={20} color={colors.text} />
      </TouchableOpacity>

      <View style={[styles.titlePill, { top: insets.top + 12 }]} pointerEvents="none">
        <Text style={styles.titlePillText} numberOfLines={1}>
          {editingRide ? rr('formTitleEdit') : rr('formTitleNew')}
        </Text>
      </View>

      {mapPickTarget != null && (
        <View style={[styles.mapPickBanner, { top: insets.top + 60 }]}>
          <RRIcon id="touchApp" size={15} color={accent} />
          <Text style={styles.mapPickText} numberOfLines={2}>
            {rr('mapPickHint')}
          </Text>
          <TouchableOpacity
            style={styles.mapPickCancelBtn}
            onPress={() => {
              setMapPickTarget(null);
              setFormCollapsed(false);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.mapPickCancel}>{tr('search.close')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route card */}
      <View style={[styles.routeCard, { top: insets.top + (mapPickTarget != null ? 112 : 60) }]}>
        <Pressable
          style={({ pressed }) => [styles.routeField, pressed && styles.routeFieldPressed]}
          onPress={() => openSearch('origin')}
          accessibilityRole="button"
        >
          <Image source={ORIGIN_PIN_IMG} style={styles.routePin} resizeMode="contain" />
          <Text style={[styles.routeRowText, !originAddress && styles.routeRowPlaceholder]} numberOfLines={1}>
            {originAddress || tr('labels.originPlaceholder')}
          </Text>
          <RRIcon id="edit" size={14} color={mutedIconColor} />
        </Pressable>

        {extraStops.map((stop, index) => (
          <View key={`stop-${index}`} style={styles.routeFieldStatic}>
            <Pressable
              style={({ pressed }) => [styles.routeFieldInner, pressed && styles.routeFieldPressed]}
              onPress={() => openSearch(index)}
              accessibilityRole="button"
            >
              <Image source={STOP_PIN_IMG} style={styles.routePin} resizeMode="contain" />
              <Text style={[styles.routeRowText, !stop.address && styles.routeRowPlaceholder]} numberOfLines={1}>
                {stop.address || tr('labels.stopLabel', { index: index + 1 })}
              </Text>
            </Pressable>
            <TouchableOpacity
              style={styles.stopRemoveBtn}
              onPress={() => removeStop(index)}
              hitSlop={8}
              accessibilityRole="button"
            >
              <RRIcon id="close" size={14} color={mutedIconColor} />
            </TouchableOpacity>
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [styles.routeField, pressed && styles.routeFieldPressed]}
          onPress={() => openSearch('destination')}
          accessibilityRole="button"
        >
          <Image source={DEST_PIN_IMG} style={styles.routePin} resizeMode="contain" />
          <Text style={[styles.routeRowText, !destinationAddress && styles.routeRowPlaceholder]} numberOfLines={1}>
            {destinationAddress || tr('labels.destinationPlaceholder')}
          </Text>
          <RRIcon id="edit" size={14} color={mutedIconColor} />
        </Pressable>

        {extraStops.length < maxExtraStops && (
          <Pressable
            style={({ pressed }) => [styles.addStopButton, pressed && styles.routeFieldPressed]}
            onPress={() => openSearch('new-stop')}
            accessibilityRole="button"
          >
            <RRIcon id="addCircle" size={15} color={accent} />
            <Text style={styles.addStopText}>{tr('accessibility.addExtraStop')}</Text>
          </Pressable>
        )}

        <View style={styles.routeMetaRow}>
          {calculatingRoute ? (
            <>
              <ActivityIndicator size="small" color={accent} />
              <Text style={styles.routeMetaText}>{rr('routeCalculating')}</Text>
            </>
          ) : estimatedDistance > 0 ? (
            <>
              <RRIcon id="route" size={14} color={accent} />
              <Text style={styles.routeMetaText}>
                {rr('routeInfo', { distance: estimatedDistance, duration: estimatedDuration })}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Bottom form */}
      {formCollapsed ? (
        <Pressable
          style={[styles.expandFab, { bottom: insets.bottom + 14 }]}
          onPress={() => setFormCollapsed(false)}
          accessibilityRole="button"
          accessibilityLabel={rr('expandForm')}
        >
          <RRIcon id="expandForm" size={20} color={accentInk} />
        </Pressable>
      ) : (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.formWrap}>
        <View style={styles.formSheet}>
          <Pressable
            style={styles.sheetCollapseHandle}
            onPress={() => setFormCollapsed(true)}
            accessibilityRole="button"
            accessibilityLabel={rr('collapseForm')}
          >
            <View style={styles.sheetHandleBar} />
            <RRIcon id="collapseForm" size={15} color={mutedIconColor} />
          </Pressable>
          <ScrollView
            style={styles.formScroll}
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
            {(['moto', 'auto'] as RecurringRideVehicleType[]).map((type) => {
              const selected = vehicleType === type;
              return (
                <Pressable
                  key={type}
                  style={[styles.optionChip, styles.optionChipFlex, selected && styles.optionChipSelected]}
                  onPress={() => {
                    setVehicleType(type);
                    if (type === 'moto') setPassengers(1);
                  }}
                  accessibilityRole="button"
                >
                  <RRIcon id={type} size={15} color={selected ? accentInk : mutedIconColor} />
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                    {tr(`vehicle.${type}Label`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[
              styles.optionChip,
              styles.optionChipFlex,
              styles.ddChipRow,
              vehicleType === 'designated_driver' && styles.optionChipSelected,
            ]}
            onPress={() => setVehicleType('designated_driver')}
            accessibilityRole="button"
          >
            <RRIcon
              id="designated_driver"
              size={15}
              color={vehicleType === 'designated_driver' ? accentInk : mutedIconColor}
            />
            <Text style={[styles.optionChipText, vehicleType === 'designated_driver' && styles.optionChipTextSelected]}>
              {tr('vehicle.designatedLabel')}
            </Text>
          </Pressable>

          {vehicleType === 'designated_driver' && (
            <View style={styles.ddModeBox}>
              <Text style={styles.ddModeLabel}>{tr('vehicle.modeLabel')}</Text>
              <View style={styles.chipsRow}>
                {(['auto', 'moto'] as const).map((mode) => {
                  const selected = designatedDriverMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={[styles.optionChip, styles.optionChipFlex, selected && styles.optionChipSelected]}
                      onPress={() => {
                        setDesignatedDriverMode(mode);
                        if (mode === 'moto') setPassengers(1);
                      }}
                      accessibilityRole="button"
                    >
                      <RRIcon id={mode} size={15} color={selected ? accentInk : mutedIconColor} />
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                        {mode === 'auto' ? tr('vehicle.modeAuto') : tr('vehicle.modeMoto')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Text style={styles.fieldLabel}>{rr('paymentSection')}</Text>
          <View style={styles.chipsRow}>
            {(['cash', /* 'card' // pago con tarjeta no funcional por ahora */] as const).map((method) => {
              const selected = paymentMethod === method;
              return (
                <Pressable
                  key={method}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => setPaymentMethod(method)}
                  accessibilityRole="button"
                >
                  <RRIcon
                    id={method}
                    size={15}
                    color={selected ? accentInk : mutedIconColor}
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
              <RRIcon id="remove" size={18} color={colors.text} />
            </Pressable>
            <Text style={styles.stepperValue}>{passengers}</Text>
            <Pressable
              style={[styles.stepperButton, passengers >= maxPassengers && styles.stepperButtonDisabled]}
              onPress={() => setPassengers(Math.min(maxPassengers, passengers + 1))}
              disabled={passengers >= maxPassengers}
              accessibilityRole="button"
            >
              <RRIcon id="add" size={18} color={colors.text} />
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
              <ActivityIndicator size="small" color={accentInk} />
            ) : (
              <RRIcon id="saved" size={18} color={accentInk} />
            )}
            <Text style={styles.saveButtonText}>{rr('save')}</Text>
          </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      )}

      {/* Search overlay */}
      {searchVisible && (
        <View style={styles.searchOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSearch} />
          <View style={[styles.searchCard, { marginTop: insets.top + 56 }]}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>{fieldLabel(activeField)}</Text>
              <TouchableOpacity onPress={closeSearch} hitSlop={8}>
                <RRIcon id="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <RRIcon id="search" size={18} color={mutedIconColor} />
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
                <RRIcon id="myLocation" size={15} color={accent} />
                <Text style={styles.searchActionText}>{tr('search.useCurrentLocation')}</Text>
              </Pressable>
              <Pressable style={styles.searchActionChip} onPress={handlePickOnMap}>
                <RRIcon id="pickOnMap" size={15} color={accent} />
                <Text style={styles.searchActionText}>{tr('search.pickOnMap')}</Text>
              </Pressable>
            </View>
            {searchLoading && (
              <View style={styles.searchStatusRow}>
                <ActivityIndicator size="small" color={accent} />
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
                  <RRIcon id="place" size={18} color={accent} />
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

const createStyles = (colors: any, isDark: boolean) => {
  const accent = isDark ? colors.SecondBorder : '#B38737';
  const accentInk = isDark ? '#FFFFFF' : '#241A09';
  const accentSoft = isDark ? 'rgba(110,68,255,0.18)' : 'rgba(255,247,230,0.95)';
  const accentBorder = isDark ? 'rgba(110,68,255,0.55)' : 'rgba(179,135,55,0.45)';
  const accentText = isDark ? '#C4B1FF' : '#8A5800';
  return StyleSheet.create({
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
      backgroundColor: isDark ? 'rgba(30,22,60,0.95)' : 'rgba(255,247,230,0.97)',
      borderWidth: 1,
      borderColor: accentBorder,
      zIndex: 30,
    },
    mapPickText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: accentText },
    mapPickCancelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: accentBorder,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
    },
    mapPickCancel: { fontSize: 12.5, fontWeight: '700', color: accent },
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
    routeField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 13,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
      marginTop: 6,
    },
    routeFieldStatic: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    routeFieldInner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 13,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
    },
    routeFieldPressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
    stopRemoveBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.06)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
    },
    routePin: {
      width: 18,
      height: 18,
    },
    routeRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    routeRowPlaceholder: { color: colors.textSecondary, fontWeight: '500' },
    addStopButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      borderRadius: 13,
      marginTop: 8,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: accentBorder,
      backgroundColor: isDark ? 'rgba(110,68,255,0.10)' : 'rgba(255,247,230,0.6)',
    },
    addStopText: { fontSize: 13, fontWeight: '800', color: accent },
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
    expandFab: {
      position: 'absolute',
      right: 16,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 12,
      zIndex: 25,
    },
    sheetCollapseHandle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 8,
      paddingBottom: 6,
    },
    sheetHandleBar: {
      position: 'absolute',
      top: 8,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(28,25,23,0.16)',
    },
    formSheet: {
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
      overflow: 'hidden',
    },
    formScroll: {
      maxHeight: 420,
      flexGrow: 0,
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
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(28,25,23,0.1)',
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
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.05)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(28,25,23,0.1)',
    },
    optionChipSelected: {
      backgroundColor: accent,
      borderColor: accent,
    },
    optionChipFlex: { flex: 1, justifyContent: 'center' },
    optionChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
    optionChipTextSelected: { color: accentInk },
    ddChipRow: { marginTop: 8 },
    ddModeBox: {
      marginTop: 10,
      borderRadius: 14,
      padding: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(28,25,23,0.03)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
    },
    ddModeLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepperButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.06)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(28,25,23,0.1)',
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
      backgroundColor: accent,
      marginTop: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 10,
    },
    saveButtonDisabled: { opacity: 0.45 },
    saveButtonText: { fontSize: 16, fontWeight: '800', color: accentInk },
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
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(28,25,23,0.1)',
    },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, padding: 0 },
    searchActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    searchActionChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: accentSoft,
      borderWidth: 1.5,
      borderColor: accentBorder,
    },
    searchActionText: { fontSize: 12.5, fontWeight: '800', color: accentText },
    searchStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    searchStatusText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    searchErrorText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#EF8A80' : '#C62828',
      marginTop: 12,
    },
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
};
