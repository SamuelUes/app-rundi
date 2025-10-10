import React from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';

export default function Input({ style, ...props }: TextInputProps) {
  return (
    <TextInput 
      placeholderTextColor="#9CA3AF" 
      style={[styles.input, style]} 
      {...props} 
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
});
