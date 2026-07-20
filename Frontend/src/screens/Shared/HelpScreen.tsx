import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

interface FAQItem {
  question: string;
  answer: string;
}

const SUPPORT_PHONE = '+50512345678';
const WHATSAPP_NUMBER = '50512345678';
const SUPPORT_EMAIL = ' soporte@gruporzc.com';

export default function HelpScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = useMemo(
    () => [
      {
        question: t('shared.help.faqs.requestRide.question'),
        answer: t('shared.help.faqs.requestRide.answer'),
      },
      {
        question: t('shared.help.faqs.pricing.question'),
        answer: t('shared.help.faqs.pricing.answer'),
      },
      {
        question: t('shared.help.faqs.designatedDriver.question'),
        answer: t('shared.help.faqs.designatedDriver.answer'),
      },
      {
        question: t('shared.help.faqs.cancelRide.question'),
        answer: t('shared.help.faqs.cancelRide.answer'),
      },
      {
        question: t('shared.help.faqs.rateRide.question'),
        answer: t('shared.help.faqs.rateRide.answer'),
      },
      {
        question: t('shared.help.faqs.paymentMethods.question'),
        answer: t('shared.help.faqs.paymentMethods.answer'),
      },
      {
        question: t('shared.help.faqs.becomeDriver.question'),
        answer: t('shared.help.faqs.becomeDriver.answer'),
      },
      {
        question: t('shared.help.faqs.shareRide.question'),
        answer: t('shared.help.faqs.shareRide.answer'),
      },
      {
        question: t('shared.help.faqs.comission.question'),
        answer: t('shared.help.faqs.comission.answer'),
      },
    ],
    [t]
  );

  const toggleFAQ = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleCall = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`);
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(t('shared.help.contact.whatsappMessage'));
    Linking.openURL(`whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${message}`);
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(t('shared.help.contact.emailSubject'));
    const body = encodeURIComponent(t('shared.help.contact.emailBody'));
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('shared.help.header.title')}</Text>
          <Text style={styles.subtitle}>
            {t('shared.help.header.subtitle')}
          </Text>
        </View>

        {/* Contacto rápido */}
        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>{t('shared.help.contact.title')}</Text>
          <View style={styles.contactButtons}>
            {[
              {
                icon: 'call',
                label: t('shared.help.contact.call'),
                onPress: handleCall,
              },
              {
                icon: 'chat',
                label: t('shared.help.contact.whatsapp'),
                onPress: handleWhatsApp,
              },
              {
                icon: 'email',
                label: t('shared.help.contact.email'),
                onPress: handleEmail,
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.contactButton}
                onPress={option.onPress}
              >
                <MaterialIcons name={option.icon as any} size={28} color={colors.primary} />
                <Text style={styles.contactText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Preguntas Frecuentes */}
        <View style={styles.faqSection}>
          <Text style={styles.sectionTitle}>{t('shared.help.sections.faq')}</Text>
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
          <Text style={styles.sectionTitle}>{t('shared.help.sections.info')}</Text>
          
          {[
            {
              icon: 'language',
              title: t('shared.help.info.website.label'),
              value: t('shared.help.info.website.value'),
            },
            {
              icon: 'email',
              title: t('shared.help.info.email.label'),
              value: t('shared.help.info.email.value'),
            },
            {
              icon: 'smartphone',
              title: t('shared.help.info.phone.label'),
              value: t('shared.help.info.phone.value'),
            },
            {
              icon: 'schedule',
              title: t('shared.help.info.schedule.label'),
              value: t('shared.help.info.schedule.value'),
            },
          ].map((item) => (
            <View key={item.title} style={styles.infoCard}>
              <MaterialIcons name={item.icon as any} size={24} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>{item.title}</Text>
                <Text style={styles.infoValue}>{item.value}</Text>
              </View>
            </View>
          ))}
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
    marginTop: 28,
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
