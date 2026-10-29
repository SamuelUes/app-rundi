import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Image,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button2x.png');

type HelpIconConfig =
  | { family: 'material'; name: keyof typeof MaterialIcons.glyphMap }
  | { family: 'ionicons'; name: keyof typeof Ionicons.glyphMap };

type HelpIconProps = HelpIconConfig & {
  size: number;
  color: string;
};

interface FAQItem {
  question: string;
  answer: string;
  icon: HelpIconConfig;
}

const materialIcon = (name: keyof typeof MaterialIcons.glyphMap): HelpIconConfig => ({
  family: 'material',
  name,
});

const ionIcon = (name: keyof typeof Ionicons.glyphMap): HelpIconConfig => ({
  family: 'ionicons',
  name,
});

function HelpIcon({ family, name, size, color }: HelpIconProps) {
  return family === 'material' ? (
    <MaterialIcons name={name} size={size} color={color} />
  ) : (
    <Ionicons name={name} size={size} color={color} />
  );
}

const FAQ_TOGGLE_ICONS = {
  expanded: ionIcon('chevron-up'),
  collapsed: ionIcon('chevron-down'),
};

const INFO_CHEVRON_ICON = ionIcon('chevron-forward');

const SUPPORT_PHONE = '+50512345678';
const WHATSAPP_NUMBER = '50512345678';
const SUPPORT_EMAIL = ' soporte@gruporzc.com';

export default function HelpScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = useMemo(
    () => [
      {
        icon: ionIcon('car-sport-outline'),
        question: t('shared.help.faqs.requestRide.question'),
        answer: t('shared.help.faqs.requestRide.answer'),
      },
      {
        icon: materialIcon('payments'),
        question: t('shared.help.faqs.pricing.question'),
        answer: t('shared.help.faqs.pricing.answer'),
      },
      {
        icon: materialIcon('drive-eta'),
        question: t('shared.help.faqs.designatedDriver.question'),
        answer: t('shared.help.faqs.designatedDriver.answer'),
      },
      {
        icon: materialIcon('event-busy'),
        question: t('shared.help.faqs.cancelRide.question'),
        answer: t('shared.help.faqs.cancelRide.answer'),
      },
      {
        icon: ionIcon('star-outline'),
        question: t('shared.help.faqs.rateRide.question'),
        answer: t('shared.help.faqs.rateRide.answer'),
      },
      {
        icon: materialIcon('credit-card'),
        question: t('shared.help.faqs.paymentMethods.question'),
        answer: t('shared.help.faqs.paymentMethods.answer'),
      },
      {
        icon: materialIcon('badge'),
        question: t('shared.help.faqs.becomeDriver.question'),
        answer: t('shared.help.faqs.becomeDriver.answer'),
      },
      {
        icon: materialIcon('share'),
        question: t('shared.help.faqs.shareRide.question'),
        answer: t('shared.help.faqs.shareRide.answer'),
      },
      {
        icon: materialIcon('percent'),
        question: t('shared.help.faqs.comission.question'),
        answer: t('shared.help.faqs.comission.answer'),
      },
    ],
    [t]
  );

  const toggleFAQ = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleBackPress = () => {
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    const parentNavigator =
      typeof navigation?.getParent === 'function' ? navigation.getParent() : null;

    if (
      parentNavigator &&
      typeof parentNavigator.canGoBack === 'function' &&
      parentNavigator.canGoBack()
    ) {
      parentNavigator.goBack();
      return;
    }

    navigation.goBack?.();
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Header */}
        <View style={[styles.topRow, { marginTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Image source={BACK_BUTTON_ICON} style={styles.backIcon} resizeMode="contain" />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>{t('shared.help.header.title')}</Text>
          <Text style={styles.subtitle}>
            {t('shared.help.header.subtitle')}
          </Text>
        </View>

        {/* Contacto rápido */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('shared.help.contact.title')}</Text>
          <View style={styles.contactButtons}>
            {[
              {
                icon: ionIcon('call'),
                tint: colors.secondary,
                label: t('shared.help.contact.call'),
                onPress: handleCall,
              },
              {
                icon: ionIcon('logo-whatsapp'),
                tint: colors.success,
                label: t('shared.help.contact.whatsapp'),
                onPress: handleWhatsApp,
              },
              {
                icon: ionIcon('mail-outline'),
                tint: colors.warning,
                label: t('shared.help.contact.email'),
                onPress: handleEmail,
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.contactButton}
                onPress={option.onPress}
                activeOpacity={0.7}
              >
                <View
                  style={[styles.contactIconTile, { backgroundColor: option.tint + '1F' }]}
                >
                  <HelpIcon {...option.icon} size={22} color={option.tint} />
                </View>
                <Text style={styles.contactText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Preguntas Frecuentes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('shared.help.sections.faq')}</Text>
          <View style={styles.groupCard}>
            {faqs.map((faq, index) => {
              const expanded = expandedIndex === index;

              return (
                <View key={index} style={index < faqs.length - 1 && styles.faqRowBorder}>
                  <TouchableOpacity
                    style={styles.faqHeader}
                    onPress={() => toggleFAQ(index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.faqIconTile}>
                      <HelpIcon
                        {...faq.icon}
                        size={18}
                        color={expanded ? colors.primary : colors.textSecondary}
                      />
                    </View>
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <HelpIcon
                      {...(expanded ? FAQ_TOGGLE_ICONS.expanded : FAQ_TOGGLE_ICONS.collapsed)}
                      size={20}
                      color={expanded ? colors.primary : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {expanded && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
                </View>
              );
            })}
          </View>
        </View>

        {/* Información adicional */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('shared.help.sections.info')}</Text>
          <View style={styles.groupCard}>
            {[
              {
                icon: ionIcon('globe-outline'),
                title: t('shared.help.info.website.label'),
                value: t('shared.help.info.website.value'),
                onPress: () => Linking.openURL('https://rundiapp.com'),
              },
              {
                icon: ionIcon('mail-outline'),
                title: t('shared.help.info.email.label'),
                value: t('shared.help.info.email.value'),
                onPress: handleEmail,
              },
              {
                icon: ionIcon('phone-portrait-outline'),
                title: t('shared.help.info.phone.label'),
                value: t('shared.help.info.phone.value'),
                onPress: handleCall,
              },
              {
                icon: materialIcon('schedule'),
                title: t('shared.help.info.schedule.label'),
                value: t('shared.help.info.schedule.value'),
                onPress: undefined,
              },
            ].map((item, index, arr) => {
              const rowContent = (
                <>
                  <View style={styles.infoIconTile}>
                    <HelpIcon {...item.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoTitle}>{item.title}</Text>
                    <Text style={styles.infoValue}>{item.value.trim()}</Text>
                  </View>
                  {item.onPress && (
                    <HelpIcon {...INFO_CHEVRON_ICON} size={20} color={colors.textSecondary} />
                  )}
                </>
              );

              const rowStyle = [
                styles.infoRow,
                index < arr.length - 1 && styles.infoRowBorder,
              ];

              return item.onPress ? (
                <TouchableOpacity
                  key={item.title}
                  style={rowStyle}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  {rowContent}
                </TouchableOpacity>
              ) : (
                <View key={item.title} style={rowStyle}>
                  {rowContent}
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface || colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 26,
    height: 26,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  contactButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 88,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactIconTile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  faqRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
    gap: 12,
  },
  faqIconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingLeft: 60,
    paddingBottom: 16,
    marginTop: -4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
