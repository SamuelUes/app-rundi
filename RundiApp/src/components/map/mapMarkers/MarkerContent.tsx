import React from 'react';
import { View, StyleSheet, Text, Image, ImageSourcePropType } from 'react-native';
import { VEHICLE_ICON_BASE_SIZE, VEHICLE_ICON_CONTAINER_SIZE } from '../../../constants/mapIcons';

export const markerStyles = StyleSheet.create({
  bubble: {
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleSmall: { width: 34, height: 34 },
  bubbleMedium: { width: 42, height: 42 },
  bubbleLarge: { width: 48, height: 48 },
  bubbleText: { color: '#ffffff', fontWeight: '600' },
  extraStopText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  driverIcon: { fontSize: 22 },
  driverBubbleWrapper: { alignItems: 'center' },
  driverBubbleImage: { width: 64, height: 64, resizeMode: 'contain' },
  driverBubbleAvatar: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
  },
  driverBubbleAvatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  driverBubbleAvatarFallback: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  driverBubbleAvatarFallbackText: { fontSize: 16, fontWeight: '700', color: '#475569' },
  driverRatingBadge: {
    position: 'absolute',
    top: -16,
    left: '50%',
    transform: [{ translateX: -18 }],
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  driverRatingText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  driverSelectedOverlay: {
    position: 'absolute',
    bottom: 46,
    left: '50%',
    transform: [{ translateX: -32 }],
    width: 64,
    height: 72,
    alignItems: 'center',
  },
  driverBubbleVehicleContainer: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    transform: [{ translateX: -22 }],
    width: 44,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#D39838',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  driverBubbleVehicleImage: { width: 40, height: 20, resizeMode: 'contain' },
  requestWrapper: { alignItems: 'center', marginBottom: 6 },
  requestBubble: {
    backgroundColor: '#FFFFFF',
    minWidth: 180,
    maxWidth: 220,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  requestTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  requestServiceType: { fontSize: 11, fontWeight: '700', color: '#5D4B00', marginBottom: 4 },
  requestLine: { fontSize: 12, color: '#334155', marginBottom: 3 },
  requestMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  requestBubbleTouchable: { width: '100%', minHeight: 104, justifyContent: 'center', paddingVertical: 4 },
  requestPrice: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  requestPassengers: { fontSize: 12, color: '#475569' },
  requestStops: { fontSize: 11, color: '#6366F1', marginTop: 4 },
  requestHint: { fontSize: 11, color: '#64748B', marginTop: 6, textAlign: 'right' },
  requestBubbleTail: {
    width: 12,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    transform: [{ rotate: '45deg' }],
    marginTop: -6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  requestPinContainer: { alignItems: 'center', justifyContent: 'center' },
  requestMarkerImage: { width: 30, height: 29, resizeMode: 'contain' },
  requestBubbleMarkerContainer: { alignItems: 'center' },
  requestCalloutContainer: { width: 220, alignItems: 'center' },
  vehicleIconWrapper: {
    width: VEHICLE_ICON_CONTAINER_SIZE,
    height: VEHICLE_ICON_CONTAINER_SIZE,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'visible',
  },
  vehicleIconImage: { width: 52, height: 52, resizeMode: 'contain' },
  userMarkerImage: { width: 52, height: 52, resizeMode: 'contain' },
  manualOriginImage: { width: 34, height: 34, resizeMode: 'contain' },
  pinIconImage: { width: 50, height: 50, resizeMode: 'contain' },
  pinIconImageLarge: { width: 50, height: 50, resizeMode: 'contain' },
  originPinImage: { width: 28, height: 28, resizeMode: 'contain' },
  destinationPinImage: { width: 22, height: 39, resizeMode: 'contain' },
  extraStopPinImage: { width: 22, height: 39, resizeMode: 'contain' },
  pinWithBubble: { alignItems: 'center' },
  smallBubble: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
    maxWidth: 220,
  },
  smallBubbleText: { fontSize: 12, color: '#111827' },
  pinInfoBubble: {
    backgroundColor: '#FFFFFF',
    minWidth: 120,
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  pinInfoBubbleCompact: {
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pinInfoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinInfoTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pinInfoText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#1E293B',
    marginTop: 3,
    lineHeight: 16,
  },
  pinInfoMeta: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 'auto',
    paddingLeft: 10,
  },
  pinInfoMetaLine: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  pinInfoCompactText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  pinInfoCompactLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5D4B00',
    marginBottom: 1,
    textAlign: 'center',
  },
  pinInfoTail: {
    alignSelf: 'center',
    width: 12,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    transform: [{ rotate: '45deg' }],
    marginTop: -6.5,
    marginBottom: 5.5,
  },
  markerBounceContainer: { paddingBottom: 8 },
  clusterBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(21,101,192,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export const MarkerBubble = React.memo(function MarkerBubble({
  backgroundColor,
  size = 'medium',
  children,
}: {
  backgroundColor: string;
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
}) {
  const sizeStyle =
    size === 'small'
      ? markerStyles.bubbleSmall
      : size === 'large'
      ? markerStyles.bubbleLarge
      : markerStyles.bubbleMedium;
  return (
    <View style={[markerStyles.bubble, sizeStyle, { backgroundColor }]}>{children}</View>
  );
});

export type MarkerType = 'default' | 'car' | 'origin' | 'destination' | 'client' | 'manual_origin' | 'manual_origin_hold';

export const MainMarkerContent = React.memo(function MainMarkerContent({
  type,
  vehicleIconSource,
  userMarkerIcon,
  manualOriginIcon,
  manualOriginHoldIcon,
  isMarkerHeld,
  manualOriginScale = 1,
}: {
  type: MarkerType;
  vehicleIconSource?: ImageSourcePropType;
  userMarkerIcon?: ImageSourcePropType;
  manualOriginIcon?: ImageSourcePropType;
  manualOriginHoldIcon?: ImageSourcePropType;
  isMarkerHeld?: boolean;
  manualOriginScale?: number;
}) {
  if (vehicleIconSource && type === 'car') {
    return (
      <View style={markerStyles.vehicleIconWrapper}>
        <Image source={vehicleIconSource} style={markerStyles.vehicleIconImage} />
      </View>
    );
  }

  switch (type) {
    case 'car':
      return (
        <MarkerBubble backgroundColor="#4CAF50" size="large">
          <Text style={markerStyles.bubbleText}>🚗</Text>
        </MarkerBubble>
      );
    case 'origin':
    case 'client':
      if (userMarkerIcon) {
        return (
          <View style={{ transform: [{ scale: manualOriginScale }] }}>
            <Image source={userMarkerIcon} style={markerStyles.userMarkerImage} />
          </View>
        );
      }
      return (
        <MarkerBubble backgroundColor="#2196F3" size="medium">
          <Text style={markerStyles.bubbleText}>📍</Text>
        </MarkerBubble>
      );
    case 'manual_origin_hold':
    case 'manual_origin':
      if (isMarkerHeld && manualOriginHoldIcon) {
        return (
          <View style={{ transform: [{ scale: manualOriginScale }] }}>
            <Image source={manualOriginHoldIcon} style={markerStyles.manualOriginImage} />
          </View>
        );
      }
      if (manualOriginIcon) {
        return (
          <View style={{ transform: [{ scale: manualOriginScale }] }}>
            <Image source={manualOriginIcon} style={markerStyles.manualOriginImage} />
          </View>
        );
      }
      return (
        <MarkerBubble backgroundColor="#2196F3" size="medium">
          <Text style={markerStyles.bubbleText}>📍</Text>
        </MarkerBubble>
      );
    case 'destination':
      return (
        <MarkerBubble backgroundColor="#F44336" size="medium">
          <Text style={markerStyles.bubbleText}>🎯</Text>
        </MarkerBubble>
      );
    default:
      return (
        <MarkerBubble backgroundColor="#607D8B" size="medium">
          <Text style={markerStyles.bubbleText}>📍</Text>
        </MarkerBubble>
      );
  }
});

export interface PinInfoBubbleProps {
  title?: string | null;
  text?: string | null;
  meta?: string | null;
  label?: string | null;
  accentColor?: string;
  compact?: boolean;
}

export const PinInfoBubble = React.memo(function PinInfoBubble({
  title,
  text,
  meta,
  label,
  accentColor = '#0F172A',
  compact = false,
}: PinInfoBubbleProps) {
  const safeTitle = typeof title === 'string' && title.trim().length > 0 ? title : null;
  const safeText = typeof text === 'string' && text.trim().length > 0 ? text : null;
  const safeMeta = typeof meta === 'string' && meta.trim().length > 0 ? meta : null;
  const safeLabel = typeof label === 'string' && label.trim().length > 0 ? label : null;

  if (compact) {
    const compactText = safeMeta || safeText || safeTitle;
    if (!compactText) return null;
    return (
      <View style={markerStyles.pinWithBubble} collapsable={false}>
        <View collapsable={false} style={[markerStyles.pinInfoBubble, markerStyles.pinInfoBubbleCompact]}>
          {!!safeLabel && (
            <Text numberOfLines={1} style={markerStyles.pinInfoCompactLabel}>
              {safeLabel}
            </Text>
          )}
          <Text numberOfLines={1} style={[markerStyles.pinInfoCompactText, { color: accentColor }]}>
            {compactText}
          </Text>
        </View>
        <View collapsable={false} style={markerStyles.pinInfoTail} />
      </View>
    );
  }

  if (!safeTitle && !safeText && !safeMeta && !safeLabel) return null;

  return (
    <View style={markerStyles.pinWithBubble} collapsable={false}>
      <View collapsable={false} style={markerStyles.pinInfoBubble}>
        {(safeTitle || safeMeta) && (
          <View collapsable={false} style={markerStyles.pinInfoTitleRow}>
            {!!safeTitle && (
              <Text numberOfLines={1} style={[markerStyles.pinInfoTitle, { color: accentColor }]}>
                {safeTitle.toUpperCase()}
              </Text>
            )}
            {!!safeMeta && (
              <Text numberOfLines={1} style={[markerStyles.pinInfoMeta, { color: accentColor }]}>
                {safeMeta}
              </Text>
            )}
          </View>
        )}
        {!!safeText && (
          <Text numberOfLines={2} style={markerStyles.pinInfoText}>
            {safeText}
          </Text>
        )}
      </View>
      <View collapsable={false} style={markerStyles.pinInfoTail} />
    </View>
  );
});
