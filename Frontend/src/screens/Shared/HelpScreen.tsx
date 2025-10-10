import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface FAQItem {
  question: string;
  answer: string;
}

export default function HelpScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = [
    {
      question: '¿Cómo solicito un viaje?',
      answer: 'Ingresa tu destino en la pantalla principal, confirma la ubicación en el mapa y selecciona "Confirmar Viaje". Un conductor cercano recibirá tu solicitud.',
    },
    {
      question: '¿Cómo funciona el precio?',
      answer: 'El precio base es C$50 + C$35 por kilómetro. Se aplican recargos en horas pico (6-9am, 5-8pm) y para conductor designado (+50%).',
    },
    {
      question: '¿Qué es conductor designado?',
      answer: 'Un conductor designado maneja tu vehículo. Ideal si has tomado alcohol. El conductor llega en moto y maneja tu auto de regreso a casa.',
    },
    {
      question: '¿Cómo cancelo un viaje?',
      answer: 'Puedes cancelar desde la pantalla de confirmación antes de que el conductor llegue. Después de 5 minutos puede aplicar cargo de cancelación.',
    },
    {
      question: '¿Cómo califico mi viaje?',
      answer: 'Al finalizar el viaje, recibirás una notificación para calificar. También puedes hacerlo desde el historial de viajes.',
    },
    {
      question: '¿Qué métodos de pago aceptan?',
      answer: 'Aceptamos tarjetas de crédito/débito a través de Stripe y efectivo. Puedes gestionar tus métodos de pago en tu perfil.',
    },
    {
      question: '¿Cómo me convierto en conductor?',
      answer: 'Regístrate como conductor, sube tus documentos (licencia, circulación, seguro) y espera la aprobación. Recibirás un email cuando estés activo.',
    },
    {
      question: '¿Puedo compartir mi viaje?',
      answer: 'Sí, durante el viaje puedes compartir un enlace de tracking en tiempo real con familiares o amigos para que vean tu ubicación.',
    },
  ];

  const toggleFAQ = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleCall = () => {
    Linking.openURL('tel:+50512345678');
  };

  const handleWhatsApp = () => {
    Linking.openURL('whatsapp://send?phone=50512345678&text=Hola, necesito ayuda con DriveAngel.ni');
  };

  const handleEmail = () => {
    Linking.openURL('mailto:soporte@driveangel.online?subject=Ayuda DriveAngel.ni');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Centro de Ayuda</Text>
          <Text style={styles.subtitle}>
            Encuentra respuestas a tus preguntas
          </Text>
        </View>

        {/* Contacto rápido */}
        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>Contacto Rápido</Text>
          <View style={styles.contactButtons}>
            <TouchableOpacity style={styles.contactButton} onPress={handleCall}>
              <Text style={styles.contactIcon}>📞</Text>
              <Text style={styles.contactText}>Llamar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactButton} onPress={handleWhatsApp}>
              <Text style={styles.contactIcon}>💬</Text>
              <Text style={styles.contactText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactButton} onPress={handleEmail}>
              <Text style={styles.contactIcon}>📧</Text>
              <Text style={styles.contactText}>Email</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preguntas Frecuentes */}
        <View style={styles.faqSection}>
          <Text style={styles.sectionTitle}>Preguntas Frecuentes</Text>
          {faqs.map((faq, index) => (
            <View key={index} style={styles.faqCard}>
              <TouchableOpacity
                style={styles.faqHeader}
                onPress={() => toggleFAQ(index)}
              >
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <Text style={styles.faqArrow}>
                  {expandedIndex === index ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>
              {expandedIndex === index && (
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Información adicional */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Información</Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>🌐</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Sitio Web</Text>
              <Text style={styles.infoValue}>driveangel.online</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📧</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Email</Text>
              <Text style={styles.infoValue}>soporte@driveangel.online</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📱</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Teléfono</Text>
              <Text style={styles.infoValue}>+505 1234-5678</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>⏰</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Horario de Atención</Text>
              <Text style={styles.infoValue}>24/7 - Siempre disponible</Text>
            </View>
          </View>
        </View>
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
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  contactSection: {
    marginBottom: 32,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  contactButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  faqSection: {
    marginBottom: 32,
  },
  faqCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  faqArrow: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  infoSection: {
    marginBottom: 32,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
