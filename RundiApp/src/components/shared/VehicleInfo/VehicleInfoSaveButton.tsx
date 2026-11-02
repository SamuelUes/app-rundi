import React from 'react';
import { View, Text } from 'react-native';
import Button from '../../ui/Button';

interface VehicleInfoSaveButtonProps {
  allSectionsComplete: boolean;
  saving: boolean;
  completionText: Record<string, string>;
  buttons: Record<string, string>;
  onSave: () => void;
  styles: any;
}

export function VehicleInfoSaveButton({
  allSectionsComplete,
  saving,
  completionText,
  buttons,
  onSave,
  styles,
}: VehicleInfoSaveButtonProps) {
  return (
    <View style={styles.buttonContainer}>
      {allSectionsComplete ? (
        <View style={styles.allCompletedBanner}>
          <Text style={styles.allCompletedText}>{completionText.allDone}</Text>
        </View>
      ) : (
        <Text style={styles.incompleteText}>{buttons.incompleteWarning ?? ''}</Text>
      )}
      <Button
        title={
          allSectionsComplete
            ? buttons.saveAllComplete ?? buttons.save ?? ''
            : buttons.save ?? buttons.saveAllComplete ?? ''
        }
        onPress={onSave}
        disabled={saving}
        loading={saving}
      />
    </View>
  );
}
