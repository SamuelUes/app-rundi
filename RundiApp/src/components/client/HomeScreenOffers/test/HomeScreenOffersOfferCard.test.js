import React from 'react';
import { Animated } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { HomeScreenOffersOfferCard } from '../HomeScreenOffersOfferCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../../shared/StorageImage', () => () => null);

const props = {
  item: {
    driverId: 'captain',
    driver: { name: 'Captain', rating: null, photoURL: null },
    crewFollower: { driverId: 'follower', name: 'Colleague', rating: 4.5 },
    arrivalVehiclePhoto: 'vehicle.jpg',
  },
  selected: false,
  isDark: false,
  colors: { text: '#000', textSecondary: '#555', textTertiary: '#777', primary: '#987', card: '#fff' },
  arrivalLabel: 'Soon',
  etaLabel: '1 min',
  plate: 'ABC123',
  clientPriceLabel: '$10',
  driverPriceLabel: '$10',
  currentPriceLabel: '$10',
  currentPricePending: false,
  previousPriceLabel: null,
  offerCaption: 'Offer',
  hasDriverPrice: true,
  negotiationLabel: null,
  driverAcceptedMyPrice: false,
  confirming: false,
  displayName: 'Captain',
  vehicleType: 'sedan',
  ratingLabel: null,
  photoUri: null,
  acceptedAnim: new Animated.Value(1),
  onSelect: jest.fn(),
  onMessageDriver: jest.fn(),
  onOpenNegotiation: jest.fn(),
  onConfirmDriver: jest.fn(),
  styles: {},
  t: (key) => key,
};

test('designated offer shows colleague and opens arrival vehicle photo', () => {
  const view = render(<HomeScreenOffersOfferCard {...props} isDesignatedRide />);
  expect(view.getByText('Colleague')).toBeTruthy();
  expect(view.getByText('★ 4.5')).toBeTruthy();
  fireEvent.press(view.getByText('client.homeOffers.list.viewArrivalVehiclePhoto'), { stopPropagation: jest.fn() });
  expect(view.getByTestId('arrival-photo-close')).toBeTruthy();
  fireEvent.press(view.getByTestId('arrival-photo-close'));
  expect(view.queryByTestId('arrival-photo-close')).toBeNull();
});

test('ordinary offer does not show designated information', () => {
  const view = render(<HomeScreenOffersOfferCard {...props} isDesignatedRide={false} />);
  expect(view.queryByText('Colleague')).toBeNull();
  expect(view.queryByText('client.homeOffers.list.arrivalVehiclePhoto')).toBeNull();
});
