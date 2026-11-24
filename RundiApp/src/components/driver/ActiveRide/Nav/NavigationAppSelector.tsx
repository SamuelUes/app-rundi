import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../hooks/shared/theme/useTheme';

type IconName = keyof typeof Ionicons.glyphMap;
type SelectorStep = 'apps' | 'googleMaps';

interface NavigationAppSelectorProps {
  step: SelectorStep;
  onClose: () => void;
  onSelectGoogleMaps: () => void;
  onSelectWaze: () => void;
  onSelectInRundi: () => void;
  onSelectGoogleMapsApp: () => void;
}

export function NavigationAppSelector({
  step,
  onClose,
  onSelectGoogleMaps,
  onSelectWaze,
  onSelectInRundi,
  onSelectGoogleMapsApp,
}: NavigationAppSelectorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const dismissStarted = useRef(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const entrance = Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    entrance.start();
    return () => entrance.stop();
  }, [progress]);

  const dismissThen = (action: () => void) => {
    if (dismissStarted.current) return;
    dismissStarted.current = true;
    setDismissing(true);
    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) action();
    });
  };

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.42],
  });
  const cardAnimatedStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };

  const title =
    step === 'apps'
      ? t('driver.activeRide.navigation.title')
      : t('driver.activeRide.navigation.googleMaps');
  const subtitle =
    step === 'apps'
      ? t('driver.activeRide.navigation.subtitle')
      : t('driver.activeRide.navigation.googleMapsModeSubtitle');
  const actions =
    step === 'apps'
      ? [
          {
            key: 'googleMaps',
            label: t('driver.activeRide.navigation.googleMaps'),
            icon: 'map-outline' as IconName,
            primary: true,
            dismiss: false,
            onPress: onSelectGoogleMaps,
          },
          {
            key: 'waze',
            label: t('driver.activeRide.navigation.waze'),
            icon: 'compass-outline' as IconName,
            primary: false,
            dismiss: true,
            onPress: onSelectWaze,
          },
        ]
      : [
          {
            key: 'inRundi',
            label: t('driver.activeRide.navigation.inRundi'),
            icon: 'navigate-outline' as IconName,
            primary: true,
            dismiss: true,
            onPress: onSelectInRundi,
          },
          {
            key: 'googleMapsApp',
            label: t('driver.activeRide.navigation.openGoogleMapsApp'),
            icon: 'open-outline' as IconName,
            primary: false,
            dismiss: true,
            onPress: onSelectGoogleMapsApp,
          },
        ];

  return (
    <View style={styles.layer}>
      <Animated.View
        pointerEvents="none"
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => dismissThen(onClose)}
        disabled={dismissing}
        accessibilityRole="button"
        accessibilityLabel={t('shared.toast.closeLabel')}
      />
      <Animated.View
        style={[
          styles.card,
          cardAnimatedStyle,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: `${colors.primary}24` }]}>
            <Ionicons name="navigate" size={21} color={colors.primary} />
          </View>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={() => dismissThen(onClose)}
            disabled={dismissing}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('shared.toast.closeLabel')}
          >
            <Ionicons name="close" size={21} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              style={[
                styles.actionButton,
                action.primary
                  ? { backgroundColor: colors.primary }
                  : {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
              ]}
              onPress={() =>
                action.dismiss ? dismissThen(action.onPress) : action.onPress()
              }
              disabled={dismissing}
              accessibilityRole="button"
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={action.primary ? '#1C1917' : colors.primary}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: action.primary ? '#1C1917' : colors.text },
                ]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  card: {
    width: '92%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 8px 22px rgba(0, 0, 0, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'column',
    marginTop: 13,
    gap: 8,
  },
  actionButton: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
