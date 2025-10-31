import React from 'react';
import { TextInput, TextInputProps } from 'react-native';

interface FormattedInputProps extends TextInputProps {
  format?: 'date' | 'phone' | 'plate' | 'vin' | 'number' | 'decimal' | 'none';
  maxLength?: number;
}

/**
 * Componente de input con formateo automático
 * Soporta: fechas (YYYY-MM-DD), teléfono, placa, VIN, números, decimales
 */
export const FormattedInput = React.forwardRef<TextInput, FormattedInputProps>(
  ({ format = 'none', value, onChangeText, maxLength, ...props }, ref) => {
    const formatValue = (text: string): string => {
      // Remover caracteres no permitidos según el formato
      let cleaned = text;

      switch (format) {
        case 'date':
          // Formato: YYYY-MM-DD
          cleaned = text.replace(/[^\d-]/g, '');
          if (cleaned.length > 10) cleaned = cleaned.slice(0, 10);
          
          // Auto-insertar guiones
          if (cleaned.length === 4 && !cleaned.includes('-')) {
            cleaned = cleaned + '-';
          } else if (cleaned.length === 7 && cleaned.split('-').length === 2) {
            cleaned = cleaned + '-';
          }
          return cleaned;

        case 'phone':
          // Formato: +505 XXXX-XXXX
          cleaned = text.replace(/[^\d+]/g, '');
          if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
          
          if (cleaned.startsWith('+505')) {
            const number = cleaned.slice(4);
            if (number.length > 4) {
              return `+505 ${number.slice(0, 4)}-${number.slice(4, 8)}`;
            } else if (number.length > 0) {
              return `+505 ${number}`;
            }
          }
          return cleaned;

        case 'plate':
          // Formato: M 323023 (letra espacio números)
          cleaned = text.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
          if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
          return cleaned;

        case 'vin':
          // VIN: 17 caracteres alfanuméricos
          cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (cleaned.length > 17) cleaned = cleaned.slice(0, 17);
          return cleaned;

        case 'number':
          // Solo números
          cleaned = text.replace(/[^\d]/g, '');
          if (maxLength && cleaned.length > maxLength) {
            cleaned = cleaned.slice(0, maxLength);
          }
          return cleaned;

        case 'decimal':
          // Números con punto decimal
          cleaned = text.replace(/[^\d.]/g, '');
          // Solo permitir un punto
          const parts = cleaned.split('.');
          if (parts.length > 2) {
            cleaned = parts[0] + '.' + parts.slice(1).join('');
          }
          if (maxLength && cleaned.length > maxLength) {
            cleaned = cleaned.slice(0, maxLength);
          }
          return cleaned;

        default:
          return text;
      }
    };

    const handleChangeText = (text: string) => {
      const formatted = formatValue(text);
      onChangeText?.(formatted);
    };

    // Determinar keyboardType según formato
    let keyboardType: TextInputProps['keyboardType'] = 'default';
    switch (format) {
      case 'date':
      case 'phone':
      case 'number':
        keyboardType = 'numeric';
        break;
      case 'decimal':
        keyboardType = 'decimal-pad';
        break;
      case 'plate':
      case 'vin':
        keyboardType = 'default';
        break;
    }

    return (
      <TextInput
        ref={ref}
        {...props}
        value={value as string}
        onChangeText={handleChangeText}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
    );
  }
);

FormattedInput.displayName = 'FormattedInput';
