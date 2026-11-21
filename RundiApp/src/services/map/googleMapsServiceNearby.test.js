import axios from 'axios';
import googleMapsService from './googleMapsService';

jest.mock('axios');
jest.mock('@env', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }), { virtual: true });

test('requests nearby places by popularity without requesting types', async () => {
  axios.post.mockResolvedValue({ data: { places: [] } });
  const center = { latitude: 12, longitude: -86 };

  await googleMapsService.getNearbyPlaces(center);

  expect(axios.post).toHaveBeenCalledWith(
    'https://places.googleapis.com/v1/places:searchNearby',
    expect.objectContaining({ rankPreference: 'POPULARITY', maxResultCount: 20 }),
    expect.objectContaining({
      headers: expect.objectContaining({
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
      }),
    }),
  );
});
