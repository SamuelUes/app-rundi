import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Ride } from '../../rides/entities/ride.entity';

@Entity('ride_locations')
export class RideLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  ride: Ride;

  @Column('decimal', { precision: 10, scale: 8 })
  latitude: number;

  @Column('decimal', { precision: 11, scale: 8 })
  longitude: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  speed: number; // km/h

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  heading: number; // grados (0-360)

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  accuracy: number; // metros

  @Column('timestamp')
  timestamp: Date;

  @CreateDateColumn()
  created_at: Date;
}
