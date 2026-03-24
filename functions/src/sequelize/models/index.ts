/**
 * Índice de Modelos Sequelize
 * Definición de asociaciones
 */

import Driver from './Driver';
import Ride from './Ride';
import Payment from './Payment';
import Rating from './Rating';
import Vehicle from './Vehicle';
// import DriverPenalty from './DriverPenalty';
import DriverRecharge from './DriverRecharge';
import RideLocation from './RideLocation';
import AnalyticsEvent from './AnalyticsEvent';
import EmergencyCall from './EmergencyCall';
import DesignatedDriverInspection from './DesignatedDriverInspection';
import Service from './Service';
import DriverService from './DriverService';
import BiometricAuthentication from './BiometricAuthentication';
import SmsVerificationCode from './SmsVerificationCode';
import Card from './Card';
import ServiceCommissionHistory from './ServiceCommissionHistory';

// Asociaciones
// Ride - Payment (1:1)
Ride.hasOne(Payment, { foreignKey: 'ride_id', as: 'payment' });
Payment.belongsTo(Ride, { foreignKey: 'ride_id', as: 'ride' });
// Driver - Rating (1:N)
Driver.hasMany(Rating, { foreignKey: 'to_user_id', as: 'ratings' });
Rating.belongsTo(Driver, { foreignKey: 'to_user_id', as: 'driver' });
// Driver - Vehicle (1:N)
Driver.hasMany(Vehicle, { foreignKey: 'driver_id', as: 'vehicles' });
Vehicle.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
// Legacy penalties desactivado (migración a PuntoExpress)
// Driver.hasMany(DriverPenalty, { foreignKey: 'driver_id', as: 'penalties' });
// DriverPenalty.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
// Driver - DriverRecharge (1:N)
Driver.hasMany(DriverRecharge, { foreignKey: 'driver_id', as: 'recharges' });
DriverRecharge.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });

export {
  Ride,
  Payment,
  Driver,
  Rating,
  Vehicle,
  // DriverPenalty,
  DriverRecharge,
  RideLocation,
  AnalyticsEvent,
  EmergencyCall,
  DesignatedDriverInspection,
  Service,
  DriverService,
  BiometricAuthentication,
  SmsVerificationCode,
  Card,
  ServiceCommissionHistory,
};
