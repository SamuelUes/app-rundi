import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Ride } from './ride.entity';

@Entity('vehicle_inspections')
export class VehicleInspection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rideId: string;

  @ManyToOne(() => Ride)
  @JoinColumn({ name: 'rideId' })
  ride: Ride;

  // Información del vehículo
  @Column()
  licensePlate: string; // Placa

  @Column({ nullable: true })
  circulation: string; // Número de circulación

  @Column({ nullable: true })
  insurancePolicy: string; // Número de póliza de seguro

  @Column({ type: 'date', nullable: true })
  insuranceExpiryDate: Date; // Fecha de vencimiento del seguro

  // Fotos del vehículo
  @Column('simple-array', { nullable: true })
  exteriorPhotos: string[]; // URLs de fotos exteriores

  @Column('simple-array', { nullable: true })
  interiorPhotos: string[]; // URLs de fotos interiores

  // Firma del cliente
  @Column({ nullable: true })
  clientSignature: string; // URL de la firma

  // Estado del vehículo
  @Column({ type: 'text', nullable: true })
  observations: string; // Observaciones adicionales

  @Column({ default: false })
  approved: boolean; // Si la inspección fue aprobada

  @CreateDateColumn()
  createdAt: Date;
}
