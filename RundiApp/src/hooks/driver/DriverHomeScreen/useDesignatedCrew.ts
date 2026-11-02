import { useEffect, useRef, useState } from 'react';
import designatedCrewService from '../../../services/driver/designatedCrewService';
import type { CrewInvite, CrewMembership, DriverCrew } from '../../../types/designatedCrew';

export function useDesignatedCrew(userId: string | undefined, navigation?: any) {
  const [membership, setMembership] = useState<CrewMembership | null>(null);
  const [invite, setInvite] = useState<CrewInvite | null>(null);
  const [crew, setCrew] = useState<DriverCrew | null>(null);
  const navigatedRideRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const offMembership = designatedCrewService.subscribeMembership(userId, setMembership);
    const offInvite = designatedCrewService.subscribeInvite(userId, setInvite);
    return () => {
      offMembership();
      offInvite();
    };
  }, [userId]);

  useEffect(() => {
    if (!membership?.captainId) {
      setCrew(null);
      return;
    }
    return designatedCrewService.subscribeCrew(membership.captainId, setCrew);
  }, [membership?.captainId]);

  useEffect(() => {
    const rideId = membership?.role === 'follower' ? membership.currentRideId : null;
    if (!rideId || !navigation || navigatedRideRef.current === rideId) return;
    const focused = navigation.isFocused ? navigation.isFocused() : true;
    if (!focused) return;
    navigatedRideRef.current = rideId;
    navigation.navigate('FollowerActiveRide', { rideId });
  }, [membership?.role, membership?.currentRideId, navigation]);

  const isFollower = membership?.role === 'follower';
  const partner = crew ? (membership?.role === 'captain' ? crew.follower : crew.captain) : null;
  const activeInvite = invite && invite.expiresAt > Date.now() ? invite : null;

  return { membership, crew, partner, invite: activeInvite, isFollower };
}
