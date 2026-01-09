import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export type PermissionsExplanationProps = {
  role: 'driver' | 'client';
};

const PermissionsExplanation: React.FC<PermissionsExplanationProps> = ({ role }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const isDriver = role === 'driver';

  const permissions = useMemo(
    () => {
      const items: { id: string; renderContent: () => React.ReactNode }[] = [];

      items.push({
        id: 'location',
        renderContent: () => (
          <>
            <Text style={styles.permissionTitle}>{t('shared.permissions.items.location.title')}</Text>
            <Text style={styles.permissionText}>
              {isDriver
                ? t('shared.permissions.items.location.descriptionDriver')
                : t('shared.permissions.items.location.descriptionClient')}
            </Text>
          </>
        ),
      });

      if (isDriver) {
        items.push({
          id: 'overlay',
          renderContent: () => (
            <>
              <Text style={styles.permissionTitle}>{t('shared.permissions.items.overlay.title')}</Text>
              <Text style={styles.permissionText}>{t('shared.permissions.items.overlay.description')}</Text>
              {Platform.OS === 'android' && (
                <Text style={styles.permissionNote}>{t('shared.permissions.items.overlay.noteAndroid')}</Text>
              )}
            </>
          ),
        });
      }

      items.push({
        id: 'notifications',
        renderContent: () => (
          <>
            <Text style={styles.permissionTitle}>{t('shared.permissions.items.notifications.title')}</Text>
            <Text style={styles.permissionText}>{t('shared.permissions.items.notifications.intro')}</Text>
            <Text style={styles.bullet}>• {t('shared.permissions.items.notifications.bulletTrip')}</Text>
            <Text style={styles.bullet}>• {t('shared.permissions.items.notifications.bulletDriverArrived')}</Text>
            {isDriver && (
              <Text style={styles.bullet}>• {t('shared.permissions.items.notifications.bulletDriverNew')}</Text>
            )}
            <Text style={styles.bullet}>• {t('shared.permissions.items.notifications.bulletAccount')}</Text>
          </>
        ),
      });

      if (isDriver) {
        items.push({
          id: 'activity',
          renderContent: () => (
            <>
              <Text style={styles.permissionTitle}>{t('shared.permissions.items.activity.title')}</Text>
              <Text style={styles.permissionText}>{t('shared.permissions.items.activity.description')}</Text>
            </>
          ),
        });
      }

      return items;
    },
    [isDriver, styles, t],
  );

  const groups = useMemo(() => {
    const result: { id: string; renderContent: () => React.ReactNode }[][] = [];
    const groupSize = 2;

    for (let i = 0; i < permissions.length; i += groupSize) {
      result.push(permissions.slice(i, i + groupSize));
    }

    return result;
  }, [permissions]);

  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (groups.length === 0) {
      return;
    }

    opacity.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    animation.start(() => {
      setCurrentGroupIndex(prevIndex => (prevIndex + 1) % groups.length);
    });

    return () => {
      opacity.stopAnimation();
    };
  }, [currentGroupIndex, groups.length, opacity]);

  const currentGroup = groups[currentGroupIndex] ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('shared.permissions.explanation.title')}</Text>
      <Text style={styles.sectionSubtitle}>{t('shared.permissions.explanation.subtitle')}</Text>
      <Animated.View style={[styles.permissionsCarousel, { opacity }]}>
        {currentGroup.map(permission => (
          <View key={permission.id} style={styles.permissionBlock}>
            {permission.renderContent()}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginTop: 24,
      paddingHorizontal: 4,
    },
    permissionsCarousel: {
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    permissionBlock: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    permissionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    permissionText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    bullet: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 2,
    },
    permissionNote: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 6,
    },
  });

export default PermissionsExplanation;
