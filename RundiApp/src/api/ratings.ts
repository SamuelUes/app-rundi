/**
 * API v2 — ratings: submit por rol (captain/follower, AGENTS.md) y
 * consultas públicas de calificaciones de conductores.
 */

import client from './client';

export interface Rating {
  id: string;
  rideId: string;
  fromUserId: string;
  toUserId: string;
  rating: number;
  comment?: string;
  ratedRole: string; // driver|captain|follower|client
  createdAt: string;
}

export interface SubmitRatingInput {
  rideId: string;
  toUserId: string;
  ratedRole: 'driver' | 'captain' | 'follower' | 'client';
  rating: number;
  comment?: string;
  punctuality?: number;
  cleanliness?: number;
  communication?: number;
  driving?: number;
  safety?: number;
  friendliness?: number;
  /** Cierra el flujo de calificación del viaje (rating_completed). */
  finalize?: boolean;
  /** Omite la calificación (rating_skipped, sin fila en ratings). */
  skip?: boolean;
}

/** POST /v1/ratings — submitRating v1 (rol opcional, skip o finalize). */
export async function submitRating(input: SubmitRatingInput): Promise<Rating | null> {
  const { data } = await client.post<{ rating: Rating | null }>('/ratings', input);
  return data.rating;
}

export interface DriverRating {
  id: string;
  rideId: string | null;
  fromUserId: string;
  rating: number;
  comment: string | null;
  ratedRole: string | null;
  createdAt: string;
}

/** GET /v1/ratings/driver/{id} — getDriverRatings v1. */
export async function getDriverRatings(driverId: string, limit = 30): Promise<DriverRating[]> {
  const { data } = await client.get<{ ratings: DriverRating[] }>(
    `/ratings/driver/${driverId}`,
    { params: { limit } },
  );
  return data.ratings;
}

export interface DriverInsights {
  driver: {
    userId: string;
    name: string;
    averageRating: number;
    totalRides: number | null;
    department: string;
    municipality: string;
    profilePhoto: string | null;
  };
  recentComments: { rating: number; comment: string; createdAt: string; fromName: string }[];
}

/** GET /v1/ratings/driver/{id}/insights — getDriverPublicInsights v1. */
export async function getDriverPublicInsights(driverId: string, limit = 10): Promise<DriverInsights> {
  const { data } = await client.get<DriverInsights>(
    `/ratings/driver/${driverId}/insights`,
    { params: { limit } },
  );
  return data;
}
