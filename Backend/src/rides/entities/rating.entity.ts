import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Ride } from './ride.entity';

@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ride, (ride) => ride.ratings)
  @JoinColumn({ name: 'rideId' })
  ride: Ride;

  @Column()
  rideId: string;

  // Who gave the rating
  @ManyToOne(() => User, (user) => user.ratingsGiven)
  @JoinColumn({ name: 'ratedById' })
  ratedBy: User;

  @Column()
  ratedById: string;

  // Who received the rating
  @ManyToOne(() => User, (user) => user.ratingsReceived)
  @JoinColumn({ name: 'ratedUserId' })
  ratedUser: User;

  @Column()
  ratedUserId: string;

  // Rating details
  @Column({ type: 'int' })
  score: number; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  comment: string;

  @CreateDateColumn()
  createdAt: Date;
}
