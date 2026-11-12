import { getDocs } from 'firebase/firestore';
import { fetchRidePreview } from '../../services/ride/ridePreviewService';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), documentId: jest.fn(),
  getDoc: jest.fn(async () => ({ exists: () => false })),
  getDocs: jest.fn(), query: jest.fn(), where: jest.fn(),
}));
jest.mock('../../config/firebase', () => ({
  getFirebaseFirestore: jest.fn(async () => ({})),
  getFirebaseAuth: jest.fn(async () => ({ currentUser: { uid: 'driver' } })),
}));
jest.mock('../geo/serviceArea', () => ({ getCurrentServiceAreaId: () => 'ni-managua' }));

test('overlay deep link carries selected features from the Firestore trip', async () => {
  (getDocs as jest.Mock).mockResolvedValue({
    empty: false,
    docs: [{ data: () => ({
      clientId: 'client', origin: {}, destination: {},
      pricingSnapshot: { featureCodes: ['senior', 'pet_friendly'] },
    }) }],
  });
  const ride = await fetchRidePreview('ride');
  expect(ride?.featureCodes).toEqual(['senior', 'pet_friendly']);
});
