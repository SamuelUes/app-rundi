import { renderHook } from '@testing-library/react-native';
import { useDriverPublicInsights } from '../useDriverPublicInsights';

const t = (key) => key;

test('reads anonymous reviews, counts and compliments from the live profile', () => {
  const info = { driver: {
    totalRides: 9,
    compliments: { safety: 3 },
    reviews: [{ rating: 4, comment: 'Buen viaje', author: 'private', createdAt: '2026-11-01T00:00:00Z' }],
    topReviews: [{ rating: 5, comment: 'old review' }],
  } };
  const hook = renderHook(() => useDriverPublicInsights('driver', info, {}, null, t));
  expect(hook.result.current.reviewsData.ridesCount).toBe(9);
  expect(hook.result.current.reviewsData.compliments.find((item) => item.id === 'safety').count).toBe(3);
  expect(hook.result.current.reviewsData.reviews).toEqual([
    expect.objectContaining({ comment: 'Buen viaje', author: 'client.homeOffers.reviews.anonymous', rating: 4 }),
  ]);
});

test('does not report zero rides while the profile is absent', () => {
  const hook = renderHook(() => useDriverPublicInsights('driver', {}, {}, null, t));
  expect(hook.result.current.reviewsData.ridesCount).toBeNull();
});
