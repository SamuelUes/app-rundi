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
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { userManagementService } from '../../services/userManagementService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from 'i18next';

export default function DeleteAccountScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  const handleDeleteAccount = async () => {
    // Validar que el usuario haya confirmado
    if (!confirmed) {
      Alert.alert(
        'Confirmación requerida',
        'Debes confirmar que entiendes las consecuencias de eliminar tu cuenta marcando la casilla de verificación.'
      );
      return;
    }
    
    // Validar campos
    if (!email || !password) {
      Alert.alert(
        'Campos incompletos',
        'Por favor ingresa tu email y contraseña para confirmar la eliminación.'
      );
      return;
    }
    
    // Confirmar eliminación
    Alert.alert(
      'Eliminar cuenta permanentemente',
      'Esta acción no se puede deshacer. Todos tus datos serán eliminados permanentemente.\n\n¿Estás seguro que deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Cuenta',
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
                  'Cuenta eliminada',
                  result.message,
                  [
                    {
                      text: 'OK',
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
                  'Error',
                  result.message
                );
              }
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Ocurrió un error al eliminar la cuenta'
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
          <Text style={styles.headerTitle}>Eliminar Cuenta</Text>
          <Text style={styles.headerSubtitle}>
            {user?.name} • {user?.role === 'driver' ? 'Conductor' : 'Cliente'}
          </Text>
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ Acción irreversible</Text>
            <Text style={styles.warningText}>
              Al eliminar tu cuenta, se borrarán permanentemente todos tus datos incluyendo:
            </Text>
            <Text style={styles.warningText}>
              • Tu perfil y datos personales
            </Text>
            <Text style={styles.warningText}>
              • Historial de viajes
            </Text>
            <Text style={styles.warningText}>
              • Vehículos registrados (si eres conductor)
            </Text>
            <Text style={styles.warningText}>
              • Calificaciones y comentarios
            </Text>
            <Text style={styles.warningText}>
              • Métodos de pago guardados
            </Text>
            <Text style={styles.warningText}>
              • Notificaciones y mensajes
            </Text>
            <Text style={styles.warningText}>
              • Ubicaciones y tracking
            </Text>
            <Text style={styles.warningText}>
              • Todos los datos en Firebase y Supabase
            </Text>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirmar credenciales</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
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
                <Text style={{ color: '#FFFFFF', fontSize: 16 }}>✓</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.checkboxText}>
              Entiendo que esta acción es irreversible y que todos mis datos serán eliminados permanentemente
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
              {loading ? 'Eliminando cuenta...' : 'Eliminar Cuenta Permanentemente'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
