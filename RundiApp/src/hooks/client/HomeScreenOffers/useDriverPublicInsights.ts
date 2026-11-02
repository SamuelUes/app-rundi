import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import {
  fetchDriverPublicInsights,
  type DriverPublicInsights,
} from '../../../services/driver/driverPublicInsightsService';
import {
  DriverComplimentItem,
  DriverReviewItem,
} from '../../../components/shared/DriverReviewsModal';
import { parseInteger, parseTimestamp } from '../../../utils/geo/coordinates';
import { extractRatingValue } from '../../../utils/ride/rating';

const COMPLIMENT_CATALOG = [
  { id: 'punctuality', icon: '⏱️' },
  { id: 'cleanliness', icon: '🧼' },
  { id: 'communication', icon: '💬' },
  { id: 'driving', icon: '🚗' },
  { id: 'safety', icon: '🛡️' },
  { id: 'friendliness', icon: '🙂' },
] as const;

const formatRelativeDate = (value: any, t: TFunction): string => {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return t('client.homeOffers.reviews.fallbackDate');
  const diffMs = Math.max(0, Date.now() - timestamp);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);

  if (days <= 0) return t('client.homeOffers.reviews.relative.today');
  if (days === 1) return t('client.homeOffers.reviews.relative.oneDay');
  if (days < 7) return t('client.homeOffers.reviews.relative.days', { count: days });

  const weeks = Math.floor(days / 7);
  if (weeks <= 1) return t('client.homeOffers.reviews.relative.oneWeek');
  return t('client.homeOffers.reviews.relative.weeks', { count: weeks });
};

export interface DriverReviewsData {
  ridesCount: number;
  yearsWithApp: number;
  compliments: DriverComplimentItem[];
  reviews: DriverReviewItem[];
}

export function useDriverPublicInsights(
  selectedDriverId: string | undefined,
  driversInfo: Record<string, any> | null | undefined,
  driversRaw: Record<string, any> | null | undefined,
  driverPublicInsights: DriverPublicInsights | null,
  t: TFunction,
) {
  const [insights, setInsights] = useState<DriverPublicInsights | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!selectedDriverId) {
      setInsights(null);
      return;
    }

    (async () => {
      try {
        const result = await fetchDriverPublicInsights(selectedDriverId, {
          limit: 20,
          forceRefresh: true,
        });
        if (!cancelled) {
          setInsights(result);
        }
      } catch {
        if (!cancelled) {
          setInsights(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDriverId]);

  const reviewsData: DriverReviewsData = useMemo(() => {
    const effectiveInsights = insights ?? driverPublicInsights;

    const defaultCompliments: DriverComplimentItem[] = COMPLIMENT_CATALOG.map((item) => ({
      id: item.id,
      label: t(`client.homeOffers.reviews.compliments.${item.id}`, item.id),
      count: 0,
      icon: item.icon,
    }));

    if (!selectedDriverId) {
      return {
        ridesCount: 0,
        yearsWithApp: 0,
        compliments: defaultCompliments,
        reviews: [],
      };
    }

    const info = driversInfo?.[selectedDriverId] || {};
    const raw = driversRaw?.[selectedDriverId] || {};
    const rideStats = info?.stats || raw?.stats || {};

    const ridesCount =
      parseInteger(effectiveInsights?.stats?.totalRides) ??
      parseInteger(rideStats?.completedRides) ??
      parseInteger(rideStats?.totalRides) ??
      parseInteger(info?.totalRides) ??
      parseInteger(info?.completedRides) ??
      parseInteger(raw?.completedRides) ??
      0;

    const yearsWithApp =
      parseInteger(effectiveInsights?.stats?.yearsOnPlatform) ??
      parseInteger(info?.yearsOnPlatform) ??
      parseInteger(raw?.yearsOnPlatform) ??
      parseInteger(info?.experienceYears) ??
      parseInteger(raw?.experienceYears) ??
      0;

    const rawCompliments = info?.compliments || raw?.compliments;
    const insightsCountById = new Map(
      Array.isArray(effectiveInsights?.compliments)
        ? effectiveInsights.compliments.map((item) => [
            item.id,
            Math.max(0, Math.round(Number(item.count) || 0)),
          ])
        : [],
    );

    const compliments: DriverComplimentItem[] = COMPLIMENT_CATALOG.map((meta) => {
      const rawValue =
        rawCompliments && typeof rawCompliments === 'object'
          ? (rawCompliments as any)[meta.id]
          : null;
      const fromRaw =
        parseInteger(rawValue?.count) ??
        parseInteger(rawValue?.total) ??
        parseInteger(rawValue);

      return {
        id: meta.id,
        label: t(`client.homeOffers.reviews.compliments.${meta.id}`, meta.id),
        icon: meta.icon,
        count: insightsCountById.get(meta.id) ?? fromRaw ?? 0,
      };
    });

    const rawReviews =
      (Array.isArray(effectiveInsights?.reviews) ? effectiveInsights.reviews : null) ||
      (Array.isArray(info?.topReviews) ? info.topReviews : null) ||
      (Array.isArray(raw?.topReviews) ? raw.topReviews : null) ||
      (Array.isArray(info?.reviews) ? info.reviews : null) ||
      (Array.isArray(raw?.reviews) ? raw.reviews : null) ||
      [];

    const reviews = rawReviews
      .map((entry: any, index: number) => {
        const parsedRating = extractRatingValue(entry?.rating) ?? 5;
        const comment =
          typeof entry?.comment === 'string' && entry.comment.trim().length > 0
            ? entry.comment.trim()
            : typeof entry?.text === 'string' && entry.text.trim().length > 0
            ? entry.text.trim()
            : null;

        if (!comment) return null;

        const author =
          typeof entry?.author === 'string' && entry.author.trim().length > 0
            ? entry.author.trim()
            : typeof entry?.name === 'string' && entry.name.trim().length > 0
            ? entry.name.trim()
            : t('client.homeOffers.reviews.anonymous');

        return {
          id: String(entry?.id || index),
          author,
          comment,
          rating: parsedRating,
          relativeDate: formatRelativeDate(
            entry?.createdAt ?? entry?.timestamp ?? entry?.date ?? entry?.created_at,
            t,
          ),
        };
      })
      .filter((item: DriverReviewItem | null): item is DriverReviewItem => item !== null)
      .slice(0, 5);

    return {
      ridesCount,
      yearsWithApp,
      compliments,
      reviews,
    };
  }, [insights, driverPublicInsights, driversInfo, driversRaw, selectedDriverId, t]);

  return { insights, reviewsData };
}
