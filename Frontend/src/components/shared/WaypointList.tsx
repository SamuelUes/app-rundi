/**
 * WaypointList - Componente para visualizar y editar destinos múltiples
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';

interface Waypoint {
  id: string;
  address: string;
  coords: { latitude: number, longitude: number };
  isWaypoint: boolean;
}

interface WaypointListProps {
  waypoints: Waypoint[];
  onWaypointRemove: (id: string) => void;
  onWaypointReorder: (fromIndex: number, toIndex: number) => void;
  onAddWaypoint: () => void;
  onWaypointEdit: (id: string) => void;
  onWaypointAddressChange: (id: string, address: string) => void;
  colors: any;
  disabled?: boolean;
}

export default function WaypointList({
  waypoints,
  onWaypointRemove,
  onWaypointReorder,
  onAddWaypoint,
  onWaypointEdit,
  onWaypointAddressChange,
  colors,
  disabled = false
}: WaypointListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const translateYs = waypoints.map(() => new Animated.Value(0));
  const { t } = useTranslation();
  
  // Función para manejar la reordenación de waypoints con gestos
  const handleGestureEvent = (index: number) => {
    return Animated.event(
      [{ nativeEvent: { translationY: translateYs[index] } }],
      { useNativeDriver: false }
    );
  };

  const handleStateChange = (event: any, index: number) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      // Resetear la animación
      Animated.timing(translateYs[index], {
        toValue: 0,
        duration: 200,
        useNativeDriver: false
      }).start();
      
      if (draggingIndex !== null) {
        // Reordenar waypoints basado en la posición final
        const y = event.nativeEvent.translationY;
        const moveBy = Math.round(y / 60); // 60 es aproximadamente el alto de cada item
        
        if (moveBy !== 0) {
          const newIndex = Math.max(0, Math.min(waypoints.length - 1, index + moveBy));
          if (newIndex !== index) {
            onWaypointReorder(index, newIndex);
          }
        }
      }
      
      setDraggingIndex(null);
    } else if (event.nativeEvent.state === State.BEGAN) {
      setDraggingIndex(index);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('common.components.waypointList.title')}
      </Text>
      
      <ScrollView style={styles.waypointList}>
        {waypoints.map((waypoint, index) => (
          <PanGestureHandler
            key={waypoint.id}
            onGestureEvent={handleGestureEvent(index)}
            onHandlerStateChange={(e) => handleStateChange(e, index)}
            enabled={!disabled}
          >
            <Animated.View
              style={[
                styles.waypointItem,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  transform: [{ translateY: translateYs[index] }],
                  elevation: draggingIndex === index ? 5 : 1,
                  zIndex: draggingIndex === index ? 1000 : 1,
                }
              ]}
            >
              <View style={styles.waypointDragHandle}>
                <Text style={styles.dragIcon}>⋮⋮</Text>
              </View>
              
              <View style={styles.waypointContent}>
                <TextInput
                  style={[styles.waypointInput, { color: colors.text }]}
                  value={waypoint.address}
                  placeholder={t('common.components.waypointList.placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={(text) => onWaypointAddressChange(waypoint.id, text)}
                  onFocus={() => onWaypointEdit(waypoint.id)}
                  editable={!disabled}
                />
                
                <View style={styles.waypointMeta}>
                  <Text style={[styles.waypointOrder, { color: colors.textSecondary }]}>
                    {t('common.components.waypointList.orderLabel', { index: index + 1 })}
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => onWaypointRemove(waypoint.id)}
                disabled={disabled}
              >
                <Text style={styles.removeButtonText}>
                  {t('common.components.waypointList.removeButton')}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </PanGestureHandler>
        ))}
      </ScrollView>
      
      {!disabled && (
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={onAddWaypoint}
        >
          <Text style={styles.addButtonText}>
            {t('common.components.waypointList.addButton')}
          </Text>
        </TouchableOpacity>
      )}
      
      <View style={styles.infoContainer}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          {t('common.components.waypointList.info')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  waypointList: {
    maxHeight: 200,
  },
  waypointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
  },
  waypointDragHandle: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  dragIcon: {
    fontSize: 16,
    color: '#888',
  },
  waypointContent: {
    flex: 1,
  },
  waypointInput: {
    fontSize: 15,
  },
  waypointMeta: {
    flexDirection: 'row',
    marginTop: 4,
  },
  waypointOrder: {
    fontSize: 12,
  },
  removeButton: {
    padding: 10,
  },
  removeButtonText: {
    fontSize: 16,
    color: '#f44336',
  },
  addButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  infoContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
