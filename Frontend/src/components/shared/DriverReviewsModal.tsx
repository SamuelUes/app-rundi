import React from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';

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

const renderStars = (rating: number): string => {
  const fullStars = Math.round(clampRating(rating));
  return '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
};

export default function DriverReviewsModal({
  visible,
  onClose,
  driverName,
  driverPhoto,
  rating,
  ridesCount,
  yearsWithApp,
  compliments,
  reviews,
}: DriverReviewsModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const safeRating = typeof rating === 'number' && Number.isFinite(rating) ? rating : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.card }]}> 
          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileSection}>
              {driverPhoto ? (
                <Image source={{ uri: driverPhoto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{asText(driverName, 'D').charAt(0).toUpperCase()}</Text>
                </View>
              )}

              <Text style={[styles.driverName, { color: colors.text }]}>{asText(driverName, t('common.roles.driver'))}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{ridesCount}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('client.homeOffers.reviews.stats.rides')}</Text>
                </View>

                {/* <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.text }]}>{yearsWithApp}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('client.homeOffers.reviews.stats.years')}</Text>
                </View> */}

                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {safeRating !== null ? safeRating.toFixed(2) : 'N/A'}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('client.homeOffers.reviews.stats.rating')}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('client.homeOffers.reviews.complimentsTitle')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.complimentsCarouselContent}
              >
                {compliments.map((item) => (
                  <View key={item.id} style={styles.complimentItem}>
                    <View style={styles.complimentBadge}>
                      <Text style={styles.complimentBadgeText}>{item.count}</Text>
                    </View>
                    <Text style={styles.complimentIcon}>{item.icon || '✅'}</Text>
                    <Text style={[styles.complimentLabel, { color: colors.text }]} numberOfLines={2}>
                      {asText(item.label, t('client.homeOffers.reviews.compliments.defaultLabel'))}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('client.homeOffers.reviews.topReviewsTitle')}</Text>
              {reviews.length === 0 ? (
                <Text style={[styles.emptyReviewsText, { color: colors.textSecondary }]}>
                  {t('client.homeOffers.reviews.empty')}
                </Text>
              ) : (
                reviews.map((item, index) => (
                  <View key={item.id} style={[styles.reviewCard, index > 0 && styles.reviewDivider]}>
                    <Text style={styles.reviewStars}>{renderStars(item.rating)}</Text>
                    <Text style={[styles.reviewComment, { color: colors.text }]}>{asText(item.comment)}</Text>
                    <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>
                      {asText(item.author, t('client.homeOffers.reviews.anonymous'))} • {asText(item.relativeDate)}
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
    backgroundColor: 'rgba(5, 8, 18, 0.72)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  closeText: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  profileSection: {
    alignItems: 'center',
    paddingBottom: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 10,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#334155',
  },
  avatarFallbackText: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 26,
  },
  driverName: {
    fontSize: 31,
    fontWeight: '800',
    marginBottom: 12,
  },
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  complimentsCarouselContent: {
    paddingRight: 8,
  },
  complimentItem: {
    width: 108,
    alignItems: 'center',
    marginRight: 12,
  },
  complimentBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    minWidth: 44,
    height: 28,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -12,
    zIndex: 2,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  complimentBadgeText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },
  complimentIcon: {
    fontSize: 38,
  },
  complimentLabel: {
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
  reviewCard: {
    paddingTop: 2,
    paddingBottom: 12,
  },
  reviewDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.22)',
    paddingTop: 12,
  },
  reviewStars: {
    color: '#F59E0B',
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 6,
  },
  reviewComment: {
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 6,
  },
  reviewMeta: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyReviewsText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
