import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

type SupportChatCategory = 'service' | 'driver' | 'payment' | 'app' | 'other';

interface SupportChatShortcutProps {
  rideId?: string | null;
  initialCategory?: SupportChatCategory;
  initialTitle?: string | null;
  destination?: 'chat' | 'complaints';
  label?: string;
  description?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function SupportChatShortcut({
  rideId = null,
  initialCategory = 'service',
  initialTitle = null,
  destination = 'chat',
  label,
  description,
  style,
  testID,
}: SupportChatShortcutProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const resolvedLabel =
    label ?? t('common.components.supportChatShortcut.defaultLabel');
  const resolvedDescription =
    description ??
    t(
      'common.components.supportChatShortcut.defaultDescription'
    );

  const handlePress = () => {
    if (destination === 'complaints') {
      navigation.navigate('SupportComplaints', { initialTicketId: null });
      return;
    }
    navigation.navigate('SupportChat', {
      rideId,
      initialCategory,
      initialTitle,
      complaintId: null,
    });
  };

  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.container, style]}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <View style={styles.iconBadge}>
        <MaterialIcons name="chat" size={24} color="#FFFFFF" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{resolvedLabel}</Text>
        <Text style={styles.subtitle}>{resolvedDescription}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginTop: 16,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  iconText: {
    display: 'none',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: 28,
    color: colors.textSecondary,
    marginLeft: 8,
  },
});
