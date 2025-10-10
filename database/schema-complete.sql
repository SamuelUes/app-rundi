-- ============================================
-- DriveAngel.ni - Database Schema COMPLETO
-- Supabase PostgreSQL
-- Actualizado: 2025-10-08
-- ============================================

-- ============================================
-- DRIVERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) UNIQUE NOT NULL,
  
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

-- ============================================
-- VEHICLES TABLE
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

-- ============================================
-- RIDES TABLE (Historial completo)
-- ============================================
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Participantes (user_id de Firebase)
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

-- ============================================
-- PAYMENTS TABLE (Stripe + Historial)
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

-- ============================================
-- RATINGS TABLE (Calificaciones bidireccionales)
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  
  -- Quién califica a quién
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

-- ============================================
-- RIDE LOCATIONS (Tracking History)
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

-- ============================================
-- ANALYTICS EVENTS (Logs y Métricas)
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Usuario
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

-- ============================================
-- ÍNDICES PARA MEJOR PERFORMANCE
-- ============================================

-- Drivers
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);

-- Vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);

-- Rides
CREATE INDEX IF NOT EXISTS idx_rides_client_id ON rides(client_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON rides(created_at);
CREATE INDEX IF NOT EXISTS idx_rides_requested_at ON rides(requested_at);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON payments(ride_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);

-- Ratings
CREATE INDEX IF NOT EXISTS idx_ratings_ride_id ON ratings(ride_id);
CREATE INDEX IF NOT EXISTS idx_ratings_to_user_id ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_from_user_id ON ratings(from_user_id);

-- Ride Locations
CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_id ON ride_locations(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_locations_timestamp ON ride_locations(timestamp);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);

-- ============================================
-- TRIGGERS PARA UPDATED_AT
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

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de viajes completos con información del conductor
CREATE OR REPLACE VIEW rides_complete AS
SELECT 
  r.*,
  d.license_number,
  d.average_rating as driver_rating,
  v.plate,
  v.brand,
  v.model,
  v.color,
  p.amount as payment_amount,
  p.status as payment_status
FROM rides r
LEFT JOIN drivers d ON r.driver_id = d.user_id
LEFT JOIN vehicles v ON d.id = v.driver_id
LEFT JOIN payments p ON r.id = p.ride_id;

-- Vista de estadísticas de conductores
CREATE OR REPLACE VIEW driver_stats AS
SELECT 
  d.user_id,
  d.license_number,
  d.status,
  COUNT(r.id) as total_rides,
  AVG(rat.rating) as average_rating,
  SUM(p.amount) as total_earnings,
  COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_rides,
  COUNT(CASE WHEN r.status = 'canceled' THEN 1 END) as canceled_rides
FROM drivers d
LEFT JOIN rides r ON d.user_id = r.driver_id
LEFT JOIN ratings rat ON d.user_id = rat.to_user_id
LEFT JOIN payments p ON r.id = p.ride_id AND p.status = 'completed'
GROUP BY d.user_id, d.license_number, d.status;

-- ============================================
-- VERIFICAR TABLAS CREADAS
-- ============================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- DATOS DE PRUEBA (OPCIONAL - Comentado)
-- ============================================

/*
-- Insertar conductor de prueba
INSERT INTO drivers (user_id, license_number, status) 
VALUES ('test-driver-123', 'LIC-12345', 'verified');

-- Insertar vehículo de prueba
INSERT INTO vehicles (driver_id, plate, brand, model, year, color, type)
SELECT id, 'ABC-123', 'Toyota', 'Corolla', 2020, 'Blanco', 'sedan'
FROM drivers WHERE user_id = 'test-driver-123';

-- Insertar viaje de prueba
INSERT INTO rides (
  client_id, driver_id,
  origin_lat, origin_lng, origin_address,
  destination_lat, destination_lng, destination_address,
  estimated_distance, estimated_duration, estimated_price,
  status
) VALUES (
  'test-client-456', 'test-driver-123',
  12.1364, -86.2514, 'Managua, Nicaragua',
  12.1500, -86.2700, 'Metrocentro, Managua',
  5000, 900, 150,
  'completed'
);
*/
