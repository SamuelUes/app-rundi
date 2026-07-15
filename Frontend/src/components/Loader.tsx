import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingIcon } from './LoadingIcon';

export default function Loader() {
  return (
    <View style={styles.container}>
      <LoadingIcon icon="refresh" size={32} color="#111827" animation="spin" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, alignItems: 'center', justifyContent: 'center' },
});
