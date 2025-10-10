import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Driver } from './driver.entity';

export enum VehicleType {
  SEDAN = 'sedan',
  SUV = 'suv',
  VAN = 'van',
  MOTO = 'moto',
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plate: string; // License plate

  @Column()
  brand: string;

  @Column()
  model: string;

  @Column()
  year: number;

  @Column()
  color: string;

  @Column({
    type: 'enum',
    enum: VehicleType,
    default: VehicleType.SEDAN,
  })
  type: VehicleType;

  @Column({ nullable: true })
  photo: string;

  // Documentos del vehículo
  @Column({ nullable: true })
  registrationNumber: string; // Número de matrícula/circulación

  @Column({ nullable: true })
  registrationExpiry: Date; // Vencimiento de matrícula

  @Column({ nullable: true })
  registrationPhoto: string; // Foto de la matrícula

  @Column({ nullable: true })
  insuranceNumber: string; // Número de póliza de seguro

  @Column({ nullable: true })
  insuranceCompany: string; // Compañía de seguros

  @Column({ nullable: true })
  insuranceExpiry: Date; // Vencimiento del seguro

  @Column({ nullable: true })
  insurancePhoto: string; // Foto del seguro

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Driver, (driver) => driver.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column()
  driverId: string;
}
