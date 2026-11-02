import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { liveTripDocId } from '../../live/tripIds';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import ratingService, { type RatingCategoryKey } from '../../services/ride/ratingService';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import alertService from '../../services/notification/alertService';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';

const STAR_GOLD = '#FFC531';

const CATEGORY_KEYS: RatingCategoryKey[] = [
  'punctuality',
  'cleanliness',
  'communication',
  'driving',
  'safety',
  'friendliness',
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function RatingStar({
  filled,
  size,
  mutedColor,
  onPress,
}: {
  filled: boolean;
  size: number;
  mutedColor: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (filled) {
      scale.value = withSequence(
        withTiming(1.28, { duration: 110 }),
        withSpring(1, { damping: 11, stiffness: 320 }),
      );
    }
  }, [filled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      hitSlop={6}
      style={[animatedStyle, { padding: size >= 40 ? 7 : 4 }]}
    >
      <MaterialIcons
        name={filled ? 'star' : 'star-border'}
        size={size}
        color={filled ? STAR_GOLD : mutedColor}
      />
    </AnimatedPressable>
  );
}

export default function RatingScreen({ route, navigation }: any) {
  const { rideId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [categoryRatings, setCategoryRatings] = useState<Record<RatingCategoryKey, number>>({
    punctuality: 0,
    cleanliness: 0,
    communication: 0,
    driving: 0,
    safety: 0,
    friendliness: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [follower, setFollower] = useState<{ name?: string; status?: string } | null>(null);
  const [tripParticipants, setTripParticipants] = useState<{
    clientId?: string;
    driverId?: string;
    followerDriverId?: string;
  }>({});
  const [followerRating, setFollowerRating] = useState(0);

  const isDriver = user?.role === 'driver';

  useEffect(() => {
    if (isDriver) return;
    // v2: el seguidor vive como campo del doc trips_live.
    getFirebaseFirestore()
      .then(async (db) => getDoc(doc(db, FS_COL.tripsLive, await liveTripDocId(rideId))))
      .then((snap) => {
        const data = snap.data() as any;
        setFollower(data?.follower ?? null);
        setTripParticipants({
          clientId: data?.clientId,
          driverId: data?.driverId,
          followerDriverId: data?.followerDriverId,
        });
      })
      .catch(() => setFollower(null));
  }, [rideId, isDriver]);

  const categoryLabels = useMemo<Record<RatingCategoryKey, string>>(
    () => ({
      punctuality: isDriver
        ? t('shared.rating.categories.punctuality.driver')
        : t('shared.rating.categories.punctuality.client'),
      cleanliness: isDriver
        ? t('shared.rating.categories.cleanliness.driver')
        : t('shared.rating.categories.cleanliness.client'),
      communication: isDriver
        ? t('shared.rating.categories.communication.driver')
        : t('shared.rating.categories.communication.client'),
      driving: isDriver
        ? t('shared.rating.categories.driving.driver')
        : t('shared.rating.categories.driving.client'),
      safety: isDriver
        ? t('shared.rating.categories.safety.driver')
        : t('shared.rating.categories.safety.client'),
      friendliness: isDriver
        ? t('shared.rating.categories.friendliness.driver')
        : t('shared.rating.categories.friendliness.client'),
    }),
    [isDriver, t],
  );

  const ratingText =
    rating === 5 ? t('shared.rating.ratingText.five')
    : rating === 4 ? t('shared.rating.ratingText.four')
    : rating === 3 ? t('shared.rating.ratingText.three')
    : rating === 2 ? t('shared.rating.ratingText.two')
    : rating === 1 ? t('shared.rating.ratingText.one')
    : '';

  const handleSelectRating = (value: number) => {
    setRating(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSubmitRating = async () => {
    if (rating === 0 && followerRating === 0) {
      alertService.showErrorAlert(t('shared.rating.alerts.missingRating'));
      return;
    }

    try {
      setSubmitting(true);
      console.log('📝 Enviando calificación para rideId:', rideId);
      const resolvedCategories: Record<RatingCategoryKey, number> = {
        punctuality: categoryRatings.punctuality > 0 ? categoryRatings.punctuality : rating,
        cleanliness: categoryRatings.cleanliness > 0 ? categoryRatings.cleanliness : rating,
        communication: categoryRatings.communication > 0 ? categoryRatings.communication : rating,
        driving: categoryRatings.driving > 0 ? categoryRatings.driving : rating,
        safety: categoryRatings.safety > 0 ? categoryRatings.safety : rating,
        friendliness: categoryRatings.friendliness > 0 ? categoryRatings.friendliness : rating,
      };

      if (rating > 0) {
        await ratingService.submitRideRating({
          rideId,
          toUserId: isDriver ? tripParticipants.clientId : tripParticipants.driverId,
          rating,
          comment,
          punctuality: resolvedCategories.punctuality,
          cleanliness: resolvedCategories.cleanliness,
          communication: resolvedCategories.communication,
          driving: resolvedCategories.driving,
          safety: resolvedCategories.safety,
          friendliness: resolvedCategories.friendliness,
          targetRole: isDriver ? 'client' : follower ? 'captain' : 'driver',
          finalize: !(follower && followerRating > 0),
        });
      }
      if (follower && followerRating > 0) {
        await ratingService.submitRideRating({
          rideId,
          toUserId: tripParticipants.followerDriverId,
          rating: followerRating,
          targetRole: 'follower',
          finalize: true,
        });
      }

      alertService.showSuccessAlert(
        t('shared.rating.alerts.successTitle'),
        t('shared.rating.alerts.successMessage'),
        () => {
        if (isDriver) {
          navigation.replace('DriverHome');
        } else {
          navigation.replace('ClientHome');
        }
      });
    } catch (error: any) {
      console.error('Error enviando calificación:', error);
      alertService.showErrorAlert(error.message || t('shared.rating.alerts.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const quickCommentsRaw = isDriver
    ? t('shared.rating.quickComments.driver', { returnObjects: true })
    : t('shared.rating.quickComments.client', { returnObjects: true });

  const quickComments: string[] = Array.isArray(quickCommentsRaw)
    ? quickCommentsRaw.map((item) => String(item))
    : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <MaterialIcons name="star" size={34} color={STAR_GOLD} />
            </View>
            <Text style={styles.title}>
              {isDriver ? t('shared.rating.header.titleDriver') : t('shared.rating.header.titleClient')}
            </Text>
            <Text style={styles.subtitle}>
              {t('shared.rating.header.subtitle')}
            </Text>

            {follower && (
              <Text style={styles.sectionTitle}>{t('shared.rating.crew.captainTitle')}</Text>
            )}

            {/* Estrellas */}
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <RatingStar
                  key={star}
                  filled={star <= rating}
                  size={44}
                  mutedColor={colors.textTertiary}
                  onPress={() => handleSelectRating(star)}
                />
              ))}
            </View>

            <Text style={styles.ratingText}>{ratingText}</Text>
          </View>

          {follower && (
            <View style={styles.followerSection}>
              <Text style={styles.sectionTitle}>
                {t('shared.rating.crew.followerTitle', { name: follower.name ?? '' })}
              </Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <RatingStar
                    key={star}
                    filled={star <= followerRating}
                    size={36}
                    mutedColor={colors.textTertiary}
                    onPress={() => {
                      setFollowerRating(star);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Comentarios rápidos */}
          {rating > 0 && (
            <View style={styles.quickCommentsContainer}>
              <Text style={styles.sectionTitle}>{t('shared.rating.sections.quickComments')}</Text>
              <View style={styles.quickComments}>
                {quickComments.map((quickComment, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.quickCommentChip,
                      comment === quickComment && styles.quickCommentChipActive,
                    ]}
                    onPress={() => setComment(quickComment)}
                  >
                    <Text
                      style={[
                        styles.quickCommentText,
                        comment === quickComment && styles.quickCommentTextActive,
                      ]}
                    >
                      {quickComment}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {rating > 0 && (
            <View style={styles.categoriesContainer}>
              <Text style={styles.sectionTitle}>{t('shared.rating.sections.categories')}</Text>

              {CATEGORY_KEYS.map((categoryKey) => (
                <View key={categoryKey} style={styles.categoryRow}>
                  <Text style={styles.categoryLabel}>{categoryLabels[categoryKey]}</Text>
                  <View style={styles.categoryStarsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <RatingStar
                        key={`${categoryKey}-${star}`}
                        filled={star <= (categoryRatings[categoryKey] || 0)}
                        size={22}
                        mutedColor={colors.textTertiary}
                        onPress={() => {
                          setCategoryRatings((prev) => ({
                            ...prev,
                            [categoryKey]: star,
                          }));
                        }}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Comentario personalizado */}
          {rating > 0 && (
            <View style={styles.commentContainer}>
              <Text style={styles.sectionTitle}>{t('shared.rating.sections.additionalComment')}</Text>
              <TextInput
                style={styles.commentInput}
                placeholder={t('shared.rating.input.commentPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={4}
                value={comment}
                onChangeText={setComment}
                textAlignVertical="top"
              />
            </View>
          )}

          <View style={styles.spacer} />

          {/* Botón enviar */}
          {(rating > 0 || followerRating > 0) && (
            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmitRating}
              disabled={submitting}
            >
              {submitting ? (
                <LoadingIcon size={20} color="#1C1508" />
              ) : (
                <Text style={styles.submitButtonText}>{t('shared.rating.buttons.submit')}</Text>
              )}
            </Pressable>
          )}

          {/* Botón omitir */}
          <Pressable
            style={styles.skipButton}
            onPress={async () => {
              try {
                // Llamar a skipRating para marcar que omitió
                await ratingService.skipRideRating(rideId);

                // Navegar según el rol del usuario
                if (isDriver) {
                  navigation.replace('DriverHome');
                } else {
                  navigation.replace('ClientHome');
                }
              } catch (error) {
                console.error('Error omitiendo calificación:', error);
                // Navegar de todas formas
                if (isDriver) {
                  navigation.replace('DriverHome');
                } else {
                  navigation.replace('ClientHome');
                }
              }
            }}
          >
            <Text style={styles.skipButtonText}>{t('shared.rating.buttons.skip')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 197, 49, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 197, 49, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  ratingText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    minHeight: 28,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  quickCommentsContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  quickComments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCommentChip: {
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickCommentChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(179, 135, 55, 0.14)',
  },
  quickCommentText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  quickCommentTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  categoriesContainer: {
    marginBottom: 24,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  categoryStarsRow: {
    flexDirection: 'row',
  },
  followerSection: {
    marginTop: 24,
    marginBottom: 8,
    gap: 10,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  commentContainer: {
    marginBottom: 20,
  },
  commentInput: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: colors.text,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spacer: {
    flex: 1,
    minHeight: 16,
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: '#1C1508',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
