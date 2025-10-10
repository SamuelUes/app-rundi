export interface Ride {
  id: string;
  clientId: string;
  driverId?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  price: number;
  status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'canceled';
  createdAt: number;
}
