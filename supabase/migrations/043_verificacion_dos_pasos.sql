-- Verificación en dos pasos (MFA con app autenticadora, TOTP).
-- Quien la activó tiene que entrar con contraseña + código para tocar sus datos: no alcanza con la contraseña
-- aunque se llame a la API directo. Quien no la activó sigue igual que antes.
-- Patrón de Supabase: https://supabase.com/docs/guides/auth/auth-mfa#enforce-rules-for-mfa-logins

-- true si la persona no tiene ningún factor verificado, o si esta sesión ya pasó el código (aal2).
-- security definer: authenticated no puede leer auth.mfa_factors.
create or replace function private.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    );
$$;

revoke all on function private.mfa_ok() from public;
grant execute on function private.mfa_ok() to authenticated;

-- Política restrictiva en cada tabla que usa el panel: se suma (AND) a las que ya había, para todo comando.
-- Solo para authenticated: la página pública de reservas (anon) no cambia.
do $$
declare
  t text;
begin
  foreach t in array array[
    'availability', 'businesses', 'clients', 'profiles', 'reservations', 'resource_services',
    'resources', 'services', 'staff_invites', 'staff_members', 'time_off'
  ] loop
    execute format('drop policy if exists "Exige el segundo paso si está activado" on public.%I', t);
    execute format(
      'create policy "Exige el segundo paso si está activado" on public.%I as restrictive for all to authenticated '
      'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
  end loop;
end $$;

-- Las funciones del panel que saltean RLS (security definer) piden lo mismo antes de hacer nada
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array[
    'accept_staff_invite', 'cancel_reservation_owner', 'create_owner_reservation',
    'create_team_invite', 'delete_professional', 'set_reservation_status'
  ] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn;
    if def is null or position('private.mfa_ok()' in def) > 0 then continue; end if;
    def := regexp_replace(def, 'if auth\.uid\(\) is null then',
      E'if auth.uid() is not null and not private.mfa_ok() then\n    raise exception ''Ingresá el código de verificación en dos pasos para seguir'';\n  end if;\n  if auth.uid() is null then');
    execute def;
  end loop;
end $$;
