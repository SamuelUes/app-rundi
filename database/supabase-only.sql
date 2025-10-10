-- ============================================
-- SUPABASE POSTGRESQL - SOLO DATOS HISTÓRICOS
-- DriveAngel.ni
-- Actualizado: 2025-10-08
-- ============================================
-- 
-- IMPORTANTE: Este schema es SOLO para Supabase
-- Los datos en tiempo real están en Firebase
-- ============================================

-- ============================================
-- DRIVERS TABLE
-- Datos sensibles de conductores
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) UNIQUE NOT NULL,  -- Firebase UID
  
  -- Licencia
  license_number VARCHAR(50),
  license_expiry DATE,
  license_photo VARCHAR(500),
  
  -- Estado y verificación
  status VARCHAR(20) DEFAULT 'pending',
  verified_at TIMESTAMP,
  
  -- Estadísticas (cache de Firebase)
  total_rides INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0,
  total_earnings DECIMAL(10, 2) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE drivers IS 'Datos sensibles de conductores - sincronizado con Firebase Firestore users';
COMMENT ON COLUMN drivers.user_id IS 'Firebase Auth UID';

-- ============================================
-- VEHICLES TABLE
-- Información completa de vehículos
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  
  -- Información básica
  plate VARCHAR(20) NOT NULL,
  brand VARCHAR(50),
  model VARCHAR(50),
  year INTEGER,
  color VARCHAR(30),
  type VARCHAR(20),
  
  -- Documentos - Matrícula
  registration_number VARCHAR(50),
  registration_expiry DATE,
  registration_photo VARCHAR(500),
  
  -- Documentos - Seguro
  insurance_number VARCHAR(50),
  insurance_company VARCHAR(100),
  insurance_expiry DATE,
  insurance_photo VARCHAR(500),
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE vehicles IS 'Vehículos de conductores con documentación completa';

-- ============================================
-- RIDES TABLE
-- Historial COMPLETO de viajes
-- ============================================
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Participantes (Firebase UIDs)
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255),
  
  -- Ubicaciones - Origen
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),
  origin_address TEXT,
  
  -- Ubicaciones - Destino
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),
  destination_address TEXT,
  
  -- Métricas estimadas
  estimated_distance INTEGER,
  estimated_duration INTEGER,
  
  -- Métricas reales
  actual_distance INTEGER,
  actual_duration INTEGER,
  
  -- Precios
  estimated_price DECIMAL(10, 2),
  final_fare DECIMAL(10, 2),
  client_suggested_price DECIMAL(10, 2),
  
  -- Información adicional
  notes TEXT,
  ride_type VARCHAR(20) DEFAULT 'normal',
  
  -- Estados
  status VARCHAR(20) DEFAULT 'requested',
  cancel_reason VARCHAR(100),
  canceled_by VARCHAR(255),
  
  -- Timestamps
  requested_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  canceled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE rides IS 'Historial completo de viajes - Viajes activos están en Firebase Realtime DB';
COMMENT ON COLUMN rides.client_id IS 'Firebase Auth UID del cliente';
COMMENT ON COLUMN rides.driver_id IS 'Firebase Auth UID del conductor';

-- ============================================
-- PAYMENTS TABLE
-- Historial de pagos con Stripe
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  
  -- Montos
  amount DECIMAL(10, 2) NOT NULL,
  tip DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) GENERATED ALWAYS AS (amount + tip) STORED,
  
  -- Método de pago
  payment_method VARCHAR(20),
  
  -- Estado
  status VARCHAR(20) DEFAULT 'pending',
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  
  -- Timestamps
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Historial de pagos procesados con Stripe';

-- ============================================
-- RATINGS TABLE
-- Calificaciones bidireccionales
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  
  -- Quién califica a quién (Firebase UIDs)
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  
  -- Calificación
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  
  -- Categorías (opcional)
  punctuality INTEGER CHECK (punctuality >= 1 AND punctuality <= 5),
  cleanliness INTEGER CHECK (cleanliness >= 1 AND cleanliness <= 5),
  communication INTEGER CHECK (communication >= 1 AND communication <= 5),
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ratings IS 'Calificaciones de clientes y conductores';

-- ============================================
-- RIDE_LOCATIONS TABLE
-- Historial de tracking (ruta completa)
-- ============================================
CREATE TABLE IF NOT EXISTS ride_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  
  -- Ubicación
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  
  -- Métricas
  speed DECIMAL(5, 2),
  heading DECIMAL(5, 2),
  accuracy DECIMAL(5, 2),
  
  -- Timestamp
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ride_locations IS 'Historial de ubicaciones durante el viaje - Tracking en vivo está en Firebase Realtime DB';

-- ============================================
-- ANALYTICS_EVENTS TABLE
-- Logs y métricas
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Usuario (Firebase UID)
  user_id VARCHAR(255),
  
  -- Evento
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  
  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  platform VARCHAR(20),
  app_version VARCHAR(20),
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE analytics_events IS 'Eventos de analytics y logs del sistema';

-- ============================================
-- EMERGENCY_CALLS TABLE
-- Registro de llamadas de emergencia
-- ============================================
CREATE TABLE IF NOT EXISTS emergency_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Usuario que llamó (Firebase UID)
  user_id VARCHAR(255) NOT NULL,
  user_role VARCHAR(20) NOT NULL, -- 'driver' o 'client'
  
  -- Tipo de emergencia
  emergency_type VARCHAR(20) NOT NULL, -- 'police' o 'ambulance'
  emergency_number VARCHAR(10) NOT NULL, -- '118' o '102'
  
  -- Ubicación al momento de la llamada
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  address TEXT,
  
  -- Viaje relacionado (si aplica)
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  
  -- Información adicional
  notes TEXT,
  call_status VARCHAR(20) DEFAULT 'initiated', -- 'initiated', 'completed', 'canceled'
  
  -- Timestamps
  called_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE emergency_calls IS 'Registro de llamadas de emergencia realizadas por usuarios';
COMMENT ON COLUMN emergency_calls.user_id IS 'Firebase Auth UID del usuario que llamó';
COMMENT ON COLUMN emergency_calls.emergency_type IS 'Tipo: police (118) o ambulance (102)';
COMMENT ON COLUMN emergency_calls.ride_id IS 'ID del viaje si la emergencia ocurrió durante un viaje';

-- ============================================
-- ÍNDICES
-- ============================================

-- Drivers
CREATE INDEX idx_drivers_user_id ON drivers(user_id);
CREATE INDEX idx_drivers_status ON drivers(status);

-- Vehicles
CREATE INDEX idx_vehicles_driver_id ON vehicles(driver_id);
CREATE INDEX idx_vehicles_plate ON vehicles(plate);

-- Rides
CREATE INDEX idx_rides_client_id ON rides(client_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_created_at ON rides(created_at);

-- Payments
CREATE INDEX idx_payments_ride_id ON payments(ride_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_id ON payments(stripe_payment_intent_id);

-- Ratings
CREATE INDEX idx_ratings_ride_id ON ratings(ride_id);
CREATE INDEX idx_ratings_to_user_id ON ratings(to_user_id);

-- Ride Locations
CREATE INDEX idx_ride_locations_ride_id ON ride_locations(ride_id);
CREATE INDEX idx_ride_locations_timestamp ON ride_locations(timestamp);

-- Analytics
CREATE INDEX idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created_at ON analytics_events(created_at);

-- Emergency Calls
CREATE INDEX idx_emergency_calls_user_id ON emergency_calls(user_id);
CREATE INDEX idx_emergency_calls_ride_id ON emergency_calls(ride_id);
CREATE INDEX idx_emergency_calls_type ON emergency_calls(emergency_type);
CREATE INDEX idx_emergency_calls_created_at ON emergency_calls(created_at);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_calls_updated_at BEFORE UPDATE ON emergency_calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DESHABILITAR ROW LEVEL SECURITY
-- (Para permitir acceso desde Firebase Functions)
-- ============================================
ALTER TABLE drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE rides DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE ride_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_calls DISABLE ROW LEVEL SECURITY;

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de viajes completos
CREATE OR REPLACE VIEW rides_complete AS
SELECT 
  r.*,
  d.license_number,
  d.average_rating as driver_rating,
  v.plate,
  v.brand,
  v.model,
  p.amount as payment_amount,
  p.status as payment_status
FROM rides r
LEFT JOIN drivers d ON r.driver_id = d.user_id
LEFT JOIN vehicles v ON d.id = v.driver_id
LEFT JOIN payments p ON r.id = p.ride_id;

-- Vista de emergencias con información del usuario
CREATE OR REPLACE VIEW emergency_calls_complete AS
SELECT 
  ec.*,
  r.status as ride_status,
  r.origin_address as ride_origin,
  r.destination_address as ride_destination
FROM emergency_calls ec
LEFT JOIN rides r ON ec.ride_id = r.id
ORDER BY ec.created_at DESC;

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
