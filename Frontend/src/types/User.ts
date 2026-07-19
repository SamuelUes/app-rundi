export type Role = 'client' | 'driver' | 'admin' | 'designated_driver';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  profilePhoto?: string;
  fcmToken?: string;
  notificationsEnabled?: boolean;
}
