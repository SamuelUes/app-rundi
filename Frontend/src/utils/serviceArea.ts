import { getPreflightResult } from '../stores/preflightStore';

const DEFAULT_AREA_ID = 'ni-managua';

export function getCurrentServiceAreaId(): string {
  return getPreflightResult()?.region?.serviceAreaId || DEFAULT_AREA_ID;
}

export function getActiveRidesByAreaPath(areaId?: string): string {
  return `activeRidesByArea/${areaId || getCurrentServiceAreaId()}`;
}
