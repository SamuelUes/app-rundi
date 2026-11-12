export type CrewRole = 'captain' | 'follower';
export type CrewCandidateStatus = 'available' | 'busy' | 'paired' | 'offline' | 'not_eligible' | 'self' | 'invited';
export type FollowerRideStatus = 'active' | 'abandoned' | 'completed' | 'canceled';

export interface CrewMemberSnapshot {
  driverId: string;
  name: string;
  rating: number;
  licenseNumber: string;
  photoURL: string | null;
}

export interface CrewCandidate extends CrewMemberSnapshot {
  status: CrewCandidateStatus;
}

export interface CrewMembership {
  role: CrewRole;
  captainId: string;
  partnerId: string;
  currentRideId?: string | null;
  updatedAt?: number;
  // Invitación emitida vigente (solo capitán): backend la escribe en Invite y
  // la pisa AcceptInvite; expirada se ignora por expiresAt < Date.now().
  pendingInvite?: { followerId: string; name?: string; expiresAt: number; createdAt?: number } | null;
}

export interface CrewInvite {
  captainId: string;
  captain: CrewMemberSnapshot;
  createdAt: number;
  expiresAt: number;
}

export interface DriverCrew {
  captainId: string;
  followerId: string;
  createdAt: number;
  captain: CrewMemberSnapshot;
  follower: CrewMemberSnapshot;
}

export interface RideFollower extends CrewMemberSnapshot {
  status: FollowerRideStatus;
  joinedAt?: number;
  leftAt?: number;
  releasedAt?: number;
  location?: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    timestamp?: number;
  };
}
