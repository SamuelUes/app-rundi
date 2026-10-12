import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import StorageImage from './StorageImage';

export interface DriverReviewItem {
  id: string;
  author: string;
  comment: string;
  rating: number;
  relativeDate: string;
}

export interface DriverComplimentItem {
  id: string;
  label: string;
  count: number;
  icon?: string;
}

interface DriverReviewsModalProps {
  visible: boolean;
  onClose: () => void;
  driverName: string;
  driverPhoto?: string | null;
  rating: number | null;
  ridesCount: number;
  yearsWithApp: number;
  compliments: DriverComplimentItem[];
  reviews: DriverReviewItem[];
}

const asText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
};

const clampRating = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 5) return 5;
  return value;
};

const getInitials = (name?: string, fallback: string = 'D') => {
  const safe = asText(name).trim();
  if (!safe) return fallback;
  const parts = safe.split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

const COMPLIMENT_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  punctuality: 'schedule',
  cleanliness: 'local-car-wash',
  communication: 'forum',
  driving: 'directions-car',
  safety: 'security',
  friendliness: 'mood',
};

export default function DriverReviewsModal({
  visible,
  onClose,
  driverName,
  driverPhoto,
  rating,
  ridesCount,
  compliments,
  reviews,
}: DriverReviewsModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [driverPhoto]);

  const safeRating = typeof rating === 'number' && Number.isFinite(rating) ? rating : null;
  const visibleCompliments = compliments.filter((item) => Number(item.count) > 0);

  const insetBackground = isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5';
  const insetBorder = isDark ? 'rgba(255,255,255,0.09)' : '#E7E7E7';
  const goldTint = isDark ? 'rgba(212,175,55,0.16)' : 'rgba(179,135,55,0.10)';
  const goldBorder = isDark ? 'rgba(212,175,55,0.38)' : 'rgba(179,135,55,0.3)';
  const goldText = isDark ? '#FFD666' : '#8A5800';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('common.actions.close')}
        />
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)' },
            ]}
          />

          <TouchableOpacity
            style={[
              styles.closeButton,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
              },
            ]}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.close')}
          >
            <MaterialIcons name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileSection}>
              <View style={[styles.avatarRing, { borderColor: 'rgba(179,135,55,0.5)' }]}>
                {driverPhoto && !photoFailed ? (
                  <StorageImage
                    uri={driverPhoto}
                    style={styles.avatar}
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarFallback,
                      { backgroundColor: goldTint },
                    ]}
                  >
                    <Text style={[styles.avatarFallbackText, { color: colors.primary }]}>
                      {getInitials(driverName)}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.driverName, { color: colors.text }]} numberOfLines={1}>
                {asText(driverName, t('common.roles.driver'))}
              </Text>

              <View
                style={[
                  styles.statStrip,
                  { backgroundColor: insetBackground, borderColor: insetBorder },
                ]}
              >
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{ridesCount}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('client.homeOffers.reviews.stats.rides')}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: insetBorder }]} />
                <View style={styles.statCell}>
                  <View style={styles.statValueRow}>
                    <MaterialIcons name="star" size={15} color={colors.primary} />
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      {safeRating !== null ? safeRating.toFixed(1) : '—'}
                    </Text>
                  </View>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    {t('client.homeOffers.reviews.stats.rating')}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.section,
                { backgroundColor: insetBackground, borderColor: insetBorder },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('client.homeOffers.reviews.complimentsTitle')}
              </Text>
              {visibleCompliments.length === 0 ? (
                <View style={styles.miniEmpty}>
                  <MaterialIcons name="emoji-events" size={18} color={colors.textTertiary} />
                  <Text style={[styles.miniEmptyText, { color: colors.textSecondary }]}>
                    {t('client.homeOffers.reviews.complimentsEmpty')}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.complimentsRow}
                >
                  {visibleCompliments.map((item) => (
                    <View
                      key={item.id}
                      style={[
                        styles.complimentChip,
                        { backgroundColor: goldTint, borderColor: goldBorder },
                      ]}
                    >
                      <MaterialIcons
                        name={COMPLIMENT_ICONS[item.id] ?? 'check-circle'}
                        size={14}
                        color={goldText}
                      />
                      <Text
                        style={[styles.complimentLabel, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {asText(item.label, t('client.homeOffers.reviews.compliments.defaultLabel'))}
                      </Text>
                      <View style={[styles.complimentCount, { backgroundColor: colors.primary }]}>
                        <Text style={styles.complimentCountText}>{item.count}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            <View
              style={[
                styles.section,
                { backgroundColor: insetBackground, borderColor: insetBorder },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('client.homeOffers.reviews.topReviewsTitle')}
              </Text>
              {reviews.length === 0 ? (
                <View style={styles.miniEmpty}>
                  <MaterialIcons name="rate-review" size={18} color={colors.textTertiary} />
                  <Text style={[styles.miniEmptyText, { color: colors.textSecondary }]}>
                    {t('client.homeOffers.reviews.empty')}
                  </Text>
                </View>
              ) : (
                reviews.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.reviewRow,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: insetBorder,
                        paddingTop: 12,
                      },
                    ]}
                  >
                    <View style={styles.reviewHeaderRow}>
                      <View style={styles.starRow}>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <MaterialIcons
                            key={i}
                            name={i < Math.round(clampRating(item.rating)) ? 'star' : 'star-border'}
                            size={13}
                            color={colors.primary}
                          />
                        ))}
                      </View>
                      <Text style={[styles.reviewDate, { color: colors.textTertiary }]}>
                        {asText(item.relativeDate)}
                      </Text>
                    </View>
                    <Text style={[styles.reviewComment, { color: colors.text }]}>
                      {asText(item.comment)}
                    </Text>
                    <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>
                      {asText(item.author, t('client.homeOffers.reviews.anonymous'))}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 2.5,
    marginTop: 8,
    marginBottom: 6,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  profileSection: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    padding: 2,
    marginBottom: 10,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    fontWeight: '800',
    fontSize: 26,
  },
  driverName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  statStrip: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  miniEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  miniEmptyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  complimentsRow: {
    gap: 8,
    paddingRight: 8,
  },
  complimentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
  },
  complimentLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  complimentCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  complimentCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  reviewRow: {
    paddingVertical: 10,
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  starRow: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  reviewComment: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  reviewMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
});
