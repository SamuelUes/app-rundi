-- 0018_row_revisions.sql — revision de fila monotona en orden de commit.
--
-- Las versiones basadas en updated_at pueden darle a un commit tardio una
-- version MENOR que un commit anterior (el timestamp se toma al inicio de la
-- transaccion, no al commit). La reconciliacion comparaba esas versiones con
-- SYSTEM_projection_status y podia concluir erroneamente "ya esta al dia".
-- Solucion: revision por fila incrementada en el BEFORE UPDATE, cuando la tx
-- ya tiene el row lock — el ganador del candado escribe el siguiente numero,
-- asi la revision es estrictamente creciente en orden de commit por fila.
--
-- El valor viaja al estado Firestore como appliedRevision (campo separado de
-- appliedVersion, que sigue siendo el fence de orden de eventos con la escala
-- del productor). rides ya tiene version entera con la misma semantica.

ALTER TABLE public.drivers  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_row_revision() RETURNS trigger AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revision_drivers ON public.drivers;
CREATE TRIGGER trg_revision_drivers BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_revision();

DROP TRIGGER IF EXISTS trg_revision_vehicles ON public.vehicles;
CREATE TRIGGER trg_revision_vehicles BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_revision();

DROP TRIGGER IF EXISTS trg_revision_payments ON public.payments;
CREATE TRIGGER trg_revision_payments BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_revision();
