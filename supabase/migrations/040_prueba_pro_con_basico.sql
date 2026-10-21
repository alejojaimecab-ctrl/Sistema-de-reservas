-- 040 · La prueba de 14 días del Pro viene con el plan Básico, no con la cuenta nueva (pedido del 2026-10-21).
--
-- Antes cada negocio nuevo arrancaba con 14 días del Pro, y crear cuentas nuevas daba pruebas nuevas.
-- Ahora un negocio nuevo arranca en Gratis sin prueba, y la primera vez que pasa al Básico (lo cambia el cobro,
-- desde el servidor) recibe 14 días del Pro de regalo. Una sola vez por negocio: si trial_ends_at ya tiene
-- fecha (aunque esté vencida), la prueba ya se usó. Lo demás del trigger queda igual que en la 036.

create or replace function private.guard_business_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_app boolean := coalesce(auth.role(), '') in ('anon', 'authenticated');
  v_plan text;
begin
  if tg_op = 'INSERT' then
    if v_from_app then
      new.plan := 'gratis';
      new.trial_ends_at := null;
    end if;
    return new;
  end if;

  if v_from_app and (new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at) then
    raise exception 'El plan se cambia desde la sección Tu plan';
  end if;

  -- Primera vez en el Básico: 14 días del Pro para probarlo
  if new.plan = 'basico' and old.plan is distinct from 'basico' and old.trial_ends_at is null and new.trial_ends_at is null then
    new.trial_ends_at := now() + interval '14 days';
  end if;

  v_plan := case when new.trial_ends_at > now() then 'pro' else new.plan end;
  if new.monthly_goal is distinct from old.monthly_goal and new.monthly_goal is not null and v_plan <> 'pro' then
    raise exception 'La meta del mes es parte del plan Pro';
  end if;
  if new.logo_path is distinct from old.logo_path and new.logo_path is not null and v_plan = 'gratis' then
    raise exception 'El logo propio es parte del plan Básico';
  end if;
  return new;
end;
$$;

comment on column public.businesses.trial_ends_at is 'Hasta cuándo dura la prueba del Pro que se regala la primera vez que el negocio pasa al Básico (migración 040). Null: todavía no la usó.';
