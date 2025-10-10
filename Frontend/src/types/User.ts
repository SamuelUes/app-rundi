export type Role = 'client' | 'driver';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}
