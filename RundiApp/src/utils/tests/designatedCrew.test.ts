import { describe, expect, it } from '@jest/globals';
import {
  getCrewRoleForRide,
  isCandidateSelectable,
  shouldShowSeparateCrewMarkers,
  formatApproxAmount,
  isFollowerWaitingPayment,
} from '../driver/designatedCrew';

describe('designatedCrew utils', () => {
  const ride = { driverId: 'cap', followerId: 'fol', status: 'in_progress' };

  it('getCrewRoleForRide', () => {
    expect(getCrewRoleForRide(ride, 'cap')).toBe('captain');
    expect(getCrewRoleForRide(ride, 'fol')).toBe('follower');
    expect(getCrewRoleForRide(ride, 'x')).toBeNull();
    expect(getCrewRoleForRide({ driverId: 'solo' }, 'solo')).toBeNull();
  });

  it('isCandidateSelectable solo si available', () => {
    expect(isCandidateSelectable('available')).toBe(true);
    expect(isCandidateSelectable('busy')).toBe(false);
    expect(isCandidateSelectable('paired')).toBe(false);
  });

  it('shouldShowSeparateCrewMarkers solo desde in_progress con seguidor activo', () => {
    expect(shouldShowSeparateCrewMarkers({ ...ride, follower: { status: 'active' } })).toBe(true);
    expect(shouldShowSeparateCrewMarkers({ ...ride, status: 'driver_on_route', follower: { status: 'active' } })).toBe(false);
    expect(shouldShowSeparateCrewMarkers({ ...ride, follower: { status: 'abandoned' } })).toBe(false);
  });

  it('formatApproxAmount antepone ±', () => {
    expect(formatApproxAmount(375, (v) => `C$${v}`)).toBe('± C$375');
  });

  it('isFollowerWaitingPayment', () => {
    expect(isFollowerWaitingPayment('pending_payment')).toBe(true);
    expect(isFollowerWaitingPayment('in_progress')).toBe(false);
  });
});
