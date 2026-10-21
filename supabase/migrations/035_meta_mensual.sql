-- 035 · Meta mensual de ganancias (sección Estadísticas, plan Pro)
-- El dueño se fija cuánto quiere facturar por mes y ve si la va cumpliendo. null = sin meta.
-- La escribe el dueño con el mismo permiso con el que edita su negocio (RLS de businesses); no se expone en la vista pública.

alter table public.businesses
  add column if not exists monthly_goal numeric(12, 2)
  check (monthly_goal is null or monthly_goal > 0);

comment on column public.businesses.monthly_goal is 'Meta de ganancias por mes que se fija el dueño (Estadísticas). null = sin meta.';
