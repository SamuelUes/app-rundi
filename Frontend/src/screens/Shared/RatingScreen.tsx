import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import ridesService from '../../services/ridesService';
import { useAuth } from '../../context/AuthContext';

export default function RatingScreen({ route, navigation }: any) {
  const { rideId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isDriver = user?.role === 'driver';

  const handleSubmitRating = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Por favor selecciona una calificación');
      return;
    }

    try {
      setSubmitting(true);
      await ridesService.rateRide(rideId, rating, comment);
      
      Alert.alert(
        '¡Gracias!',
        'Tu calificación ha sido enviada exitosamente',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'No se pudo enviar la calificación');
    } finally {
      setSubmitting(false);
    }
  };

  const quickComments = isDriver
    ? [
        'Excelente pasajero',
        'Muy puntual',
        'Amable y respetuoso',
        'Buen trato',
      ]
    : [
        'Excelente conductor',
        'Muy profesional',
        'Manejo seguro',
        'Vehículo limpio',
        'Llegó a tiempo',
      ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isDriver ? '¿Cómo fue tu pasajero?' : '¿Cómo fue tu viaje?'}
          </Text>
          <Text style={styles.subtitle}>
            Tu opinión nos ayuda a mejorar el servicio
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
              <Text style={styles.starIcon}>
                {star <= rating ? '⭐' : '☆'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {rating > 0 && (
          <Text style={styles.ratingText}>
            {rating === 5 && '¡Excelente! 🎉'}
            {rating === 4 && 'Muy bueno 👍'}
            {rating === 3 && 'Bueno 👌'}
            {rating === 2 && 'Regular 😐'}
            {rating === 1 && 'Malo 😞'}
          </Text>
        )}

        {/* Comentarios rápidos */}
        {rating > 0 && (
          <View style={styles.quickCommentsContainer}>
            <Text style={styles.quickCommentsTitle}>Comentarios rápidos:</Text>
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

        {/* Comentario personalizado */}
        {rating > 0 && (
          <View style={styles.commentContainer}>
            <Text style={styles.commentLabel}>Comentario adicional (opcional):</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Escribe tu experiencia..."
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
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Enviar Calificación</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Botón omitir */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.skipButtonText}>Omitir por ahora</Text>
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
