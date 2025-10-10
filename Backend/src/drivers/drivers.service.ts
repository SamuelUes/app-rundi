import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver } from './entities/driver.entity';
import { Vehicle } from './entities/vehicle.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
  ) {}

  async findAll(): Promise<Driver[]> {
    return this.driverRepository.find({
      relations: ['user', 'vehicles'],
    });
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({
      where: { id },
      relations: ['user', 'vehicles'],
    });
    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }
    return driver;
  }

  async findAvailable(latitude: number, longitude: number, maxDistance: number = 10): Promise<Driver[]> {
    // Implementar búsqueda por proximidad geográfica
    return this.driverRepository.find({
      where: { status: 'available' as any },
      relations: ['vehicles'],
    });
  }

  async create(createDriverDto: CreateDriverDto): Promise<Driver> {
    const driver = this.driverRepository.create(createDriverDto);
    return this.driverRepository.save(driver);
  }

  async updateLocation(driverId: string, latitude: number, longitude: number): Promise<Driver> {
    const driver = await this.findOne(driverId);
    driver.currentLat = latitude;
    driver.currentLng = longitude;
    driver.lastLocationUpdate = new Date();
    return this.driverRepository.save(driver);
  }

  async updateStatus(driverId: string, status: 'offline' | 'available' | 'busy'): Promise<Driver> {
    const driver = await this.findOne(driverId);
    driver.status = status as any;
    return this.driverRepository.save(driver);
  }

  async createVehicle(createVehicleDto: CreateVehicleDto): Promise<Vehicle> {
    const vehicle = this.vehicleRepository.create(createVehicleDto);
    return this.vehicleRepository.save(vehicle);
  }
}
