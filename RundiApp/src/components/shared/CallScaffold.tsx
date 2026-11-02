import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LoadingIcon } from '../ui/LoadingIcon';

export type CallAction =
  | { kind: 'call'; loading?: boolean; onPress: () => void }
  | { kind: 'incoming'; loading?: boolean; onAccept: () => void; onDecline: () => void }
  | { kind: 'outgoing'; loading?: boolean; onCancel: () => void }
  | { kind: 'join'; loading?: boolean; onJoin: () => void; onEnd: () => void }
  | { kind: 'incall'; loading?: boolean; onEnd: () => void };

export interface CallScaffoldLabels {
  mic: string;
  speaker: string;
  end: string;
  accept: string;
  decline: string;
  cancel: string;
  call: string;
  join: string;
}

interface CallScaffoldProps {
  overline: string;
  displayName: string;
  avatarIcon?: keyof typeof Ionicons.glyphMap;
  statusText: string;
  connected: boolean;
  showPulse: boolean;
  micEnabled: boolean;
  speakerEnabled: boolean;
  controlsEnabled: boolean;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  action: CallAction;
  onBack: () => void;
  labels: CallScaffoldLabels;
  errorText?: string | null;
  debugText?: string;
}

const AVATAR_SIZE = 112;
const ACTION_SIZE = 74;
const CONTROL_SIZE = 62;

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
};

const formatSeconds = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

function useCallTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return formatSeconds(seconds);
}

function PulseRing({ delay }: { delay: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withDelay(delay, withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) })),
      -1,
      false,
    );
  }, [delay, progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.55,
    transform: [{ scale: 1 + progress.value * 0.8 }],
  }));
  return <Animated.View style={[styles.pulseRing, animatedStyle]} pointerEvents="none" />;
}

interface CircleProps {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}

function ToggleCircle({
  label,
  icon,
  active,
  disabled,
  onPress,
}: CircleProps & { icon: keyof typeof Ionicons.glyphMap; active: boolean }) {
  return (
    <View style={styles.controlItem}>
      <TouchableOpacity
        style={[styles.controlCircle, active && styles.controlCircleActive, disabled && styles.dimmed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, disabled: !!disabled }}
      >
        <Ionicons name={icon} size={26} color={active ? '#1A130B' : 'rgba(244,238,226,0.85)'} />
      </TouchableOpacity>
      <Text style={[styles.controlLabel, disabled && styles.dimmedText]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ActionCircle({
  label,
  variant,
  disabled,
  loading,
  onPress,
}: CircleProps & { variant: 'success' | 'danger' }) {
  const isEnd = variant === 'danger';
  return (
    <View style={styles.actionItem}>
      <TouchableOpacity
        style={[
          styles.actionCircle,
          variant === 'success' ? styles.actionSuccess : styles.actionDanger,
          disabled && styles.dimmed,
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {loading ? (
          <LoadingIcon size={30} color="#FFFFFF" />
        ) : (
          <MaterialIcons name={isEnd ? 'call-end' : 'call'} size={30} color="#FFFFFF" />
        )}
      </TouchableOpacity>
      <Text style={styles.actionLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function CallScaffold({
  overline,
  displayName,
  avatarIcon,
  statusText,
  connected,
  showPulse,
  micEnabled,
  speakerEnabled,
  controlsEnabled,
  onToggleMic,
  onToggleSpeaker,
  action,
  onBack,
  labels,
  errorText,
  debugText,
}: CallScaffoldProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const timer = useCallTimer(connected);

  const pulse = showPulse && !reduceMotion;

  const actionRow = useMemo(() => {
    switch (action.kind) {
      case 'incoming':
        return (
          <View style={styles.duoRow}>
            <ActionCircle
              label={labels.decline}
              variant="danger"
              disabled={!!action.loading}
              onPress={action.onDecline}
            />
            <ActionCircle
              label={labels.accept}
              variant="success"
              loading={action.loading}
              onPress={action.onAccept}
            />
          </View>
        );
      case 'outgoing':
        return (
          <ActionCircle
            label={labels.cancel}
            variant="danger"
            loading={action.loading}
            onPress={action.onCancel}
          />
        );
      case 'join':
        return (
          <View style={styles.duoRow}>
            <ActionCircle label={labels.end} variant="danger" onPress={action.onEnd} />
            <ActionCircle
              label={labels.join}
              variant="success"
              loading={action.loading}
              onPress={action.onJoin}
            />
          </View>
        );
      case 'incall':
        return (
          <ActionCircle
            label={labels.end}
            variant="danger"
            loading={action.loading}
            onPress={action.onEnd}
          />
        );
      case 'call':
      default:
        return (
          <ActionCircle
            label={labels.call}
            variant="success"
            loading={action.loading}
            onPress={action.onPress}
          />
        );
    }
  }, [action, labels]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.minimizeButton}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={overline}
        >
          <Ionicons name="chevron-down" size={24} color="#F4EEE2" />
        </TouchableOpacity>
        <Text style={styles.overline} numberOfLines={1}>
          {overline}
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.identityBlock}>
        <View style={styles.avatarWrap}>
          {pulse ? (
            <>
              <PulseRing delay={0} />
              <PulseRing delay={1200} />
            </>
          ) : null}
          <View style={styles.avatar}>
            {avatarIcon ? (
              <Ionicons name={avatarIcon} size={44} color="#E8C985" />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
            )}
          </View>
        </View>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={[styles.statusText, connected && styles.statusTimer]}>{connected ? timer : statusText}</Text>
      </View>

      <View style={styles.controlsBlock}>
        {errorText ? (
          <View style={styles.errorPill}>
            <Ionicons name="warning-outline" size={14} color="#F28B82" />
            <Text style={styles.errorPillText} numberOfLines={2}>
              {errorText}
            </Text>
          </View>
        ) : null}

        <View style={styles.togglesRow}>
          <ToggleCircle
            label={labels.mic}
            icon={micEnabled ? 'mic' : 'mic-off'}
            active={!micEnabled}
            disabled={!controlsEnabled}
            onPress={onToggleMic}
          />
          <ToggleCircle
            label={labels.speaker}
            icon={speakerEnabled ? 'volume-high' : 'volume-mute'}
            active={speakerEnabled}
            disabled={!controlsEnabled}
            onPress={onToggleSpeaker}
          />
        </View>

        <View style={styles.actionRow}>{actionRow}</View>

        {__DEV__ && debugText ? (
          <Text style={styles.debugText} numberOfLines={1}>
            {debugText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100D0A',
    paddingHorizontal: 24,
  },
  glowTop: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(147, 112, 219, 0.16)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    left: -110,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(217, 119, 6, 0.10)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  minimizeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topBarSpacer: {
    width: 40,
    height: 40,
  },
  overline: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(244,238,226,0.50)',
  },
  identityBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  pulseRing: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(201,163,90,0.7)',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,163,90,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(201,163,90,0.45)',
  },
  avatarInitials: {
    fontSize: 38,
    fontWeight: '700',
    color: '#EEDCB4',
    letterSpacing: 1,
  },
  displayName: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#F4EEE2',
    textAlign: 'center',
  },
  statusText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(244,238,226,0.62)',
    textAlign: 'center',
  },
  statusTimer: {
    fontVariant: ['tabular-nums'],
    color: 'rgba(244,238,226,0.85)',
  },
  controlsBlock: {
    alignItems: 'center',
  },
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.40)',
    backgroundColor: 'rgba(239,83,80,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 16,
  },
  errorPillText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: '#F28B82',
  },
  togglesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 44,
    marginBottom: 26,
  },
  controlItem: {
    alignItems: 'center',
    width: 84,
  },
  controlCircle: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  controlCircleActive: {
    backgroundColor: '#F4EEE2',
    borderColor: '#F4EEE2',
  },
  controlLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(244,238,226,0.60)',
  },
  actionRow: {
    minHeight: ACTION_SIZE + 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '78%',
  },
  actionItem: {
    alignItems: 'center',
    width: 110,
  },
  actionCircle: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSuccess: {
    backgroundColor: '#22C55E',
  },
  actionDanger: {
    backgroundColor: '#E5484D',
  },
  actionLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(244,238,226,0.65)',
    textAlign: 'center',
  },
  dimmed: {
    opacity: 0.35,
  },
  dimmedText: {
    opacity: 0.6,
  },
  debugText: {
    marginTop: 14,
    fontSize: 10,
    color: 'rgba(244,238,226,0.30)',
    textAlign: 'center',
  },
});

export default CallScaffold;
