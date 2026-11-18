import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DesignatedDriverEvidenceModal } from '../../components/driver/ActiveRide/DesignatedDriverEvidenceModal';
import inspectionsService from '../../services/driver/inspectionsService';
import { uploadDesignatedDriverEvidencePhoto } from '../../services/media/storageService';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../../../hooks/shared/theme/useTheme', () => ({
  useTheme: () => ({ colors: { primary: '#999', text: '#fff', textSecondary: '#aaa', background: '#000', error: '#f00' }, isDark: true }),
}));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })) }));
jest.mock('../../../utils/system/cameraUtils', () => ({
  launchCameraSafely: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://photo.jpg' }] })),
}));
jest.mock('../../../services/driver/inspectionsService', () => ({
  __esModule: true, default: { submitDesignatedDriverRideInspection: jest.fn() },
}));
jest.mock('../../../services/media/storageService', () => ({
  uploadDesignatedDriverEvidencePhoto: jest.fn(async (_ride, _driver, _uri, type) => `storage/${type}`),
}));
jest.mock('../../../services/notification/alertService', () => ({
  __esModule: true, default: { showErrorAlert: jest.fn() },
}));

test('keeps uploaded photos after a registration error and completes on retry', async () => {
  inspectionsService.submitDesignatedDriverRideInspection
    .mockRejectedValueOnce(new Error('network error'))
    .mockResolvedValueOnce({ id: 'inspection' });
  const onCompleted = jest.fn();
  const onClose = jest.fn();
  const view = render(
    <DesignatedDriverEvidenceModal visible rideId="live-id" driverId="driver" onClose={onClose} onCompleted={onCompleted} onCancelRide={() => {}} />,
  );
  for (let i = 0; i < 6; i++) {
    fireEvent.press(view.getAllByRole('button', { name: 'driver.activeRide.evidence.takePhoto' })[0]);
    await waitFor(() => expect(view.getAllByText('driver.activeRide.evidence.captured')).toHaveLength(i + 1));
  }
  fireEvent.press(view.getByRole('checkbox'));
  fireEvent.press(view.getByText('driver.activeRide.evidence.submit'));
  await waitFor(() => expect(view.getByText('driver.activeRide.evidence.uploadError')).toBeTruthy());
  expect(uploadDesignatedDriverEvidencePhoto).toHaveBeenCalledTimes(6);
  expect(onCompleted).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('driver.activeRide.evidence.submit'));
  await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  expect(uploadDesignatedDriverEvidencePhoto).toHaveBeenCalledTimes(6);
  expect(onClose).toHaveBeenCalledTimes(1);
}, 20000);
