import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { HomeScreenOffersBottomSheet } from '../HomeScreenOffersBottomSheet';

jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('../../../ui/LoadingIcon', () => ({ LoadingIcon: () => null }));
jest.mock('../../../shared/StorageImage', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test('shows a retry action instead of an empty search on failure', () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const retry = jest.fn();
  const confirm = jest.fn();
  const messages = {
    'client.homeOffers.loadError': 'Could not load offers',
    'client.homeOffers.empty': 'No offers',
    'common.actions.tryAgain': 'Try again',
  };
  const view = render(
    <HomeScreenOffersBottomSheet
      loading={false}
      error
      onRetry={retry}
      offers={[]}
      selectedDriverId="d1"
      selectedOffer={{ driverId: 'd1', driver: { name: 'Driver', rating: null, photoURL: null } }}
      isConfirming={false}
      isCancelling={false}
      confirmBtnAnim={new Animated.Value(1)}
      cancelBtnAnim={new Animated.Value(1)}
      primaryActionLabel="Select"
      colors={{ text: '#000', textSecondary: '#444', textTertiary: '#888', primary: '#123', card: '#fff' }}
      isDark={false}
      renderOffer={() => null}
      onShowDriverReviews={() => {}}
      onConfirmSelectedDriver={confirm}
      onCancelSearch={() => {}}
      styles={{}}
      t={(key) => messages[key] || key}
    />,
  );
  expect(view.getByText('Could not load offers')).toBeTruthy();
  expect(view.queryByText('No offers')).toBeNull();
  fireEvent.press(view.getByText('Select'));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.unmount();
  jest.restoreAllMocks();
});
