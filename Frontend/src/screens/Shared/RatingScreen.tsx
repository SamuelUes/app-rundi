import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/LoadingIcon';
import { useTheme } from '../../context/ThemeContext';
import ratingService, { type RatingCategoryKey } from '../../services/ratingService';
import { useAuth } from '../../context/AuthContext';
import alertService from '../../services/alertService';
import { useTranslation } from 'react-i18next';

const CATEGORY_KEYS: RatingCategoryKey[] = [
  'punctuality',
  'cleanliness',
  'communication',
  'driving',
  'safety',
  'friendliness',
];

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

  const isDriver = user?.role === 'driver';

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

  const handleSubmitRating = async () => {
    if (rating === 0) {
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

      await ratingService.submitRideRating({
        rideId,
        rating,
        comment,
        punctuality: resolvedCategories.punctuality,
        cleanliness: resolvedCategories.cleanliness,
        communication: resolvedCategories.communication,
        driving: resolvedCategories.driving,
        safety: resolvedCategories.safety,
        friendliness: resolvedCategories.friendliness,
      });
      
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
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isDriver ? t('shared.rating.header.titleDriver') : t('shared.rating.header.titleClient')}
          </Text>
          <Text style={styles.subtitle}>
            {t('shared.rating.header.subtitle')}
          </Text>
        </View>

        {/* Estrellas */}
        <View style={styles.starsContainer}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              style={styles.starButton}
            >
              <MaterialIcons name={star <= rating ? 'star' : 'star-border'} size={32} color="#FFD700" />
            </TouchableOpacity>
          ))}
        </View>

        {rating > 0 && (
          <Text style={styles.ratingText}>
            {rating === 5 && t('shared.rating.ratingText.five')}
            {rating === 4 && t('shared.rating.ratingText.four')}
            {rating === 3 && t('shared.rating.ratingText.three')}
            {rating === 2 && t('shared.rating.ratingText.two')}
            {rating === 1 && t('shared.rating.ratingText.one')}
          </Text>
        )}

        {/* Comentarios rápidos */}
        {rating > 0 && (
          <View style={styles.quickCommentsContainer}>
            <Text style={styles.quickCommentsTitle}>{t('shared.rating.sections.quickComments')}</Text>
            <View style={styles.quickComments}>
              {quickComments.map((quickComment, index) => (
                <TouchableOpacity
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
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {rating > 0 && (
          <View style={styles.categoriesContainer}>
            <Text style={styles.quickCommentsTitle}>{t('shared.rating.sections.categories')}</Text>

            {CATEGORY_KEYS.map((categoryKey) => (
              <View key={categoryKey} style={styles.categoryRow}>
                <Text style={styles.categoryLabel}>{categoryLabels[categoryKey]}</Text>
                <View style={styles.categoryStarsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={`${categoryKey}-${star}`}
                      onPress={() => {
                        setCategoryRatings((prev) => ({
                          ...prev,
                          [categoryKey]: star,
                        }));
                      }}
                      style={styles.categoryStarButton}
                    >
                      <MaterialIcons name={star <= (categoryRatings[categoryKey] || 0) ? 'star' : 'star-border'} size={24} color="#FFD700" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Comentario personalizado */}
        {rating > 0 && (
          <View style={styles.commentContainer}>
            <Text style={styles.commentLabel}>{t('shared.rating.sections.additionalComment')}</Text>
            <TextInput
              style={styles.commentInput}
              placeholder={t('shared.rating.input.commentPlaceholder')}
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              value={comment}
              onChangeText={setComment}
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Botón enviar */}
        {rating > 0 && (
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmitRating}
            disabled={submitting}
          >
            {submitting ? (
              <LoadingIcon size={20} color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{t('shared.rating.buttons.submit')}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Botón omitir */}
        <TouchableOpacity
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
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  starButton: {
    padding: 8,
  },
  starIcon: {
    fontSize: 48,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  quickCommentsContainer: {
    marginBottom: 24,
  },
  quickCommentsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  quickComments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCommentChip: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickCommentChipActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  quickCommentText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  quickCommentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  categoriesContainer: {
    marginBottom: 24,
  },
  categoryRow: {
    marginBottom: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 6,
  },
  categoryStarsRow: {
    flexDirection: 'row',
  },
  categoryStarButton: {
    paddingRight: 6,
  },
  categoryStarText: {
    fontSize: 22,
  },
  commentContainer: {
    marginBottom: 24,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  commentInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: colors.text,
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    padding: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
