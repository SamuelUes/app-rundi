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
import DriverLicense from './DriverLicense';
import VehicleCirculationCard from './VehicleCirculationCard';
import VehicleInsurancePolicy from './VehicleInsurancePolicy';
import VehicleInspection from './VehicleInspection';
import VehicleEmissionCertificate from './VehicleEmissionCertificate';
import VehicleRoadTax from './VehicleRoadTax';
import VehicleRevisadoSticker from './VehicleRevisadoSticker';
import ComplianceRule from './ComplianceRule';
import ComplianceEvaluation from './ComplianceEvaluation';
import DocumentAlert from './DocumentAlert';
import ComplianceEvent from './ComplianceEvent';
import LicenseCategoryRule from './LicenseCategoryRule';

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
// Driver - DriverLicense (1:N historial)
Driver.hasMany(DriverLicense, { foreignKey: 'driver_id', as: 'licenses' });
DriverLicense.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
// Vehicle - documentos de compliance (1:N historial por tipo)
Vehicle.hasMany(VehicleCirculationCard, { foreignKey: 'vehicle_id', as: 'circulationCards' });
VehicleCirculationCard.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
Vehicle.hasMany(VehicleInsurancePolicy, { foreignKey: 'vehicle_id', as: 'insurancePolicies' });
VehicleInsurancePolicy.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
Vehicle.hasMany(VehicleInspection, { foreignKey: 'vehicle_id', as: 'inspections' });
VehicleInspection.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
Vehicle.hasMany(VehicleEmissionCertificate, { foreignKey: 'vehicle_id', as: 'emissionCertificates' });
VehicleEmissionCertificate.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
Vehicle.hasMany(VehicleRoadTax, { foreignKey: 'vehicle_id', as: 'roadTaxes' });
VehicleRoadTax.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
Vehicle.hasMany(VehicleRevisadoSticker, { foreignKey: 'vehicle_id', as: 'revisadoStickers' });
VehicleRevisadoSticker.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

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
  DriverLicense,
  VehicleCirculationCard,
  VehicleInsurancePolicy,
  VehicleInspection,
  VehicleEmissionCertificate,
  VehicleRoadTax,
  VehicleRevisadoSticker,
  ComplianceRule,
  ComplianceEvaluation,
  DocumentAlert,
  ComplianceEvent,
  LicenseCategoryRule,
};
