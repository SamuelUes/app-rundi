import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Driver } from '../../drivers/entities/driver.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Rating } from './rating.entity';

export enum RideStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  DRIVER_ARRIVED = 'driver_arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
}

export enum CancelReason {
  CLIENT_CANCELED = 'client_canceled',
  DRIVER_CANCELED = 'driver_canceled',
  NO_DRIVER_AVAILABLE = 'no_driver_available',
  TIMEOUT = 'timeout',
  OTHER = 'other',
}

export enum RideType {
  NORMAL = 'normal',
  DESIGNATED_DRIVER = 'designated_driver',
}

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Client
  @ManyToOne(() => User, (user) => user.ridesAsClient)
  @JoinColumn({ name: 'clientId' })
  client: User;

  @Column()
  clientId: string;

  // Driver (nullable until assigned)
  @ManyToOne(() => User, (user) => user.ridesAsDriver, { nullable: true })
  @JoinColumn({ name: 'driverId' })
  driver: User;

  @Column({ nullable: true })
  driverId: string;

  // Location details
  @Column({ type: 'decimal', precision: 10, scale: 7 })
  originLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  originLng: number;

  @Column()
  originAddress: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  destinationLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  destinationLng: number;

  @Column()
  destinationAddress: string;

  // Ride details
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  estimatedDistance: number; // in km

  @Column({ type: 'int' })
  estimatedDuration: number; // in minutes

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  estimatedFare: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalFare: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  surgeMultiplier: number;

  // Tipo de viaje
  @Column({
    type: 'enum',
    enum: RideType,
    default: RideType.NORMAL,
  })
  rideType: RideType;

  // Precios propuestos
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  clientSuggestedPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  driverProposedPrice: number;

  // Notas adicionales
  @Column({ type: 'text', nullable: true })
  notes: string;

  // Status
  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.REQUESTED,
  })
  status: RideStatus;

  @Column({
    type: 'enum',
    enum: CancelReason,
    nullable: true,
  })
  cancelReason: CancelReason;

  @Column({ nullable: true })
  cancelNote: string;

  // Timestamps
  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  arrivedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  canceledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToOne(() => Payment, (payment) => payment.ride)
  payment: Payment;

  @OneToMany(() => Rating, (rating) => rating.ride)
  ratings: Rating[];
}
