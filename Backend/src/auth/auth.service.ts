import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Vehicle } from '../drivers/entities/vehicle.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Driver)
    private driversRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private vehiclesRepository: Repository<Vehicle>,
  ) {}

  async register(registerDto: RegisterDto) {
    // Verificar si el email ya existe
    const existingUser = await this.usersRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Validar que si es conductor, tenga los datos requeridos
    if (registerDto.role === UserRole.DRIVER) {
      if (!registerDto.driverData) {
        throw new BadRequestException('Driver data is required for driver registration');
      }
      if (!registerDto.vehicleData) {
        throw new BadRequestException('Vehicle data is required for driver registration');
      }
    }

    // Hashear password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Crear usuario
    const user = this.usersRepository.create({
      email: registerDto.email,
      name: registerDto.name,
      phone: registerDto.phone,
      role: registerDto.role,
      password: hashedPassword,
    });

    await this.usersRepository.save(user);

    // Si es conductor, crear perfil de conductor y vehículo
    if (registerDto.role === UserRole.DRIVER && registerDto.driverData && registerDto.vehicleData) {
      // Crear perfil de conductor
      const driver = new Driver();
      driver.userId = user.id;
      driver.licenseNumber = registerDto.driverData.licenseNumber;
      if (registerDto.driverData.licenseExpiry) {
        driver.licenseExpiry = new Date(registerDto.driverData.licenseExpiry);
      }
      if (registerDto.driverData.licensePhoto) {
        driver.licensePhoto = registerDto.driverData.licensePhoto;
      }

      await this.driversRepository.save(driver);

      // Crear vehículo
      const vehicle = new Vehicle();
      vehicle.driverId = driver.id;
      vehicle.plate = registerDto.vehicleData.plate;
      vehicle.brand = registerDto.vehicleData.brand;
      vehicle.model = registerDto.vehicleData.model;
      vehicle.year = registerDto.vehicleData.year;
      vehicle.color = registerDto.vehicleData.color;
      vehicle.type = registerDto.vehicleData.type;
      if (registerDto.vehicleData.photo) vehicle.photo = registerDto.vehicleData.photo;
      if (registerDto.vehicleData.registrationNumber) vehicle.registrationNumber = registerDto.vehicleData.registrationNumber;
      if (registerDto.vehicleData.registrationExpiry) vehicle.registrationExpiry = new Date(registerDto.vehicleData.registrationExpiry);
      if (registerDto.vehicleData.registrationPhoto) vehicle.registrationPhoto = registerDto.vehicleData.registrationPhoto;
      if (registerDto.vehicleData.insuranceNumber) vehicle.insuranceNumber = registerDto.vehicleData.insuranceNumber;
      if (registerDto.vehicleData.insuranceCompany) vehicle.insuranceCompany = registerDto.vehicleData.insuranceCompany;
      if (registerDto.vehicleData.insuranceExpiry) vehicle.insuranceExpiry = new Date(registerDto.vehicleData.insuranceExpiry);
      if (registerDto.vehicleData.insurancePhoto) vehicle.insurancePhoto = registerDto.vehicleData.insurancePhoto;

      await this.vehiclesRepository.save(vehicle);

      console.log(`✅ Conductor registrado: ${user.name} con vehículo ${vehicle.plate}`);
    }

    // Remover password de la respuesta
    const { password, ...result } = user;
    
    return {
      user: result,
      token: this.generateToken(user),
    };
  }

  async login(loginDto: LoginDto) {
    // Buscar usuario con password
    const user = await this.usersRepository.findOne({
      where: { email: loginDto.email },
      select: ['id', 'email', 'name', 'phone', 'avatar', 'role', 'status', 'rating', 'totalRides', 'password'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verificar password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Remover password de la respuesta
    const { password, ...result } = user;

    return {
      user: result,
      token: this.generateToken(user),
    };
  }

  private generateToken(user: User): string {
    // Por ahora, retornar un token simple
    // En producción, usar JWT real
    return Buffer.from(`${user.id}:${user.email}`).toString('base64');
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [userId] = decoded.split(':');
      
      return await this.usersRepository.findOne({ where: { id: userId } });
    } catch {
      return null;
    }
  }
}
