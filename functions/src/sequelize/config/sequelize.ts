/**
 * Configuración de Sequelize para migraciones
 */

import sequelize from './database';

// Importar modelos
import Ride from '../models/Ride';
import Payment from '../models/Payment';
import Driver from '../models/Driver';
import Rating from '../models/Rating';

// Registrar modelos
const models = [Ride, Payment, Driver, Rating] as const;

// Configurar asociaciones
Ride.hasOne(Payment, { foreignKey: 'ride_id', as: 'payment' });
Payment.belongsTo(Ride, { foreignKey: 'ride_id', as: 'ride' });

Driver.hasMany(Rating, { foreignKey: 'to_user_id', as: 'ratings' });
Rating.belongsTo(Driver, { foreignKey: 'to_user_id', as: 'driver' });

export { sequelize, models };
