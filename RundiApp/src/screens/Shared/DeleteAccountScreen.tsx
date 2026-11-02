/**
 * Delete Account Screen
 * Pantalla para eliminar cuenta de usuario permanentemente
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { userManagementService } from '../../services/user/userManagementService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from 'i18next';

export default function DeleteAccountScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const roleKey =
    user?.role === 'driver' ? 'driver' : user?.role === 'client' ? 'client' : 'default';
  const warningBulletKeys = [
    'profile',
    'rideHistory',
    'vehicles',
    'ratings',
    'paymentMethods',
    'notifications',
    'locations',
    'dataStores',
  ];
  
  const handleDeleteAccount = async () => {
    // Validar que el usuario haya confirmado
    if (!confirmed) {
      Alert.alert(
        t('shared.deleteAccount.alerts.confirmRequiredTitle'),
        t('shared.deleteAccount.alerts.confirmRequiredMessage')
      );
      return;
    }
    
    // Validar campos
    if (!email || !password) {
      Alert.alert(
        t('shared.deleteAccount.alerts.missingFieldsTitle'),
        t('shared.deleteAccount.alerts.missingFieldsMessage')
      );
      return;
    }
    
    // Confirmar eliminación
    Alert.alert(
      t(
        'deleteAccount.alerts.confirmDeleteTitle',
        'Delete account permanently'
      ),
      t(
        'deleteAccount.alerts.confirmDeleteMessage',
        'This action cannot be undone. All your data will be permanently deleted.\n\nAre you sure you want to continue?'
      ),
      [
        { text: t('shared.deleteAccount.alerts.confirmDeleteCancel'), style: 'cancel' },
        {
          text: t('shared.deleteAccount.alerts.confirmDeleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await userManagementService.deleteUserAccount(email, password);
              
              if (result.success) {
                try {
                  console.log('🚪 Cerrando sesión local tras eliminar cuenta...');
                  await logout();
                } catch (logoutError) {
                  console.warn('⚠️ Error cerrando sesión tras eliminar cuenta:', logoutError);
                }

                Alert.alert(
                  t('shared.deleteAccount.alerts.successTitle'),
                  result.message,
                  [
                    {
                      text: t('shared.deleteAccount.alerts.successOk'),
                      onPress: () => {
                        // Redirigir a login
                        navigation.reset({
                          index: 0,
                          routes: [{ name: 'Login' }],
                        });
                      }
                    }
                  ]
                );
              } else {
                Alert.alert(
                  t('deleteAccount.alerts.genericErrorTitle'),
                  result.message
                );
              }
            } catch (error: any) {
              Alert.alert(
                t('shared.deleteAccount.alerts.genericErrorTitle'),
                error.message || t('shared.deleteAccount.alerts.deleteErrorMessage')
              );
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };
  
  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.card,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    content: {
      flex: 1,
      padding: 20,
    },
    warningBox: {
      backgroundColor: colors.error + '20',
      borderColor: colors.error,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    warningTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.error,
      marginBottom: 8,
    },
    warningText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: colors.text,
      marginBottom: 12,
    },
    checkboxContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: confirmed ? colors.primary : colors.border,
      backgroundColor: confirmed ? colors.primary : colors.card,
      marginRight: 12,
      marginTop: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxText: {
      fontSize: 16,
      color: colors.text,
      flex: 1,
    },
    deleteButton: {
      backgroundColor: colors.error,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 20,
    },
    deleteButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    cancelButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 12,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    loadingButton: {
      backgroundColor: colors.border,
    },
  });
  
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('shared.deleteAccount.header.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {user?.name} • {t(`shared.deleteAccount.header.roles.${roleKey}`)}
          </Text>
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>{t('shared.deleteAccount.warning.title')}</Text>
            <Text style={styles.warningText}>{t('shared.deleteAccount.warning.intro')}</Text>
            {warningBulletKeys.map((key) => (
              <Text key={key} style={styles.warningText}>
                {t(`shared.deleteAccount.warning.bullets.${key}`)}
              </Text>
            ))}
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('shared.deleteAccount.form.title')}</Text>
            
            <TextInput
              style={styles.input}
              placeholder={t('shared.deleteAccount.form.emailPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            
            <TextInput
              style={styles.input}
              placeholder={t('shared.deleteAccount.form.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>
          
          <View style={styles.checkboxContainer}>
            <TouchableOpacity 
              style={styles.checkbox}
              onPress={() => setConfirmed(!confirmed)}
              disabled={loading}
            >
              {confirmed && (
                <MaterialIcons name="check" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
            <Text style={styles.checkboxText}>
              {t('shared.deleteAccount.confirmation.checkbox')}
            </Text>
          </View>
          
          <TouchableOpacity
            style={[
              styles.deleteButton,
              loading && styles.loadingButton
            ]}
            onPress={handleDeleteAccount}
            disabled={loading}
          >
            <Text style={styles.deleteButtonText}>
              {loading ? t('shared.deleteAccount.buttons.deleting') : t('shared.deleteAccount.buttons.delete')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>{t('shared.deleteAccount.buttons.cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
