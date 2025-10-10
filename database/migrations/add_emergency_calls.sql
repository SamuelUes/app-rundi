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

-- Índices
CREATE INDEX idx_emergency_calls_user_id ON emergency_calls(user_id);
CREATE INDEX idx_emergency_calls_ride_id ON emergency_calls(ride_id);
CREATE INDEX idx_emergency_calls_type ON emergency_calls(emergency_type);
CREATE INDEX idx_emergency_calls_created_at ON emergency_calls(created_at);

-- Trigger para updated_at
CREATE TRIGGER update_emergency_calls_updated_at BEFORE UPDATE ON emergency_calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Deshabilitar RLS
ALTER TABLE emergency_calls DISABLE ROW LEVEL SECURITY;

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
