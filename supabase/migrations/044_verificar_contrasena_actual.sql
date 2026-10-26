-- Cambiar la contraseña desde el panel pide la actual: Supabase (updateUser) la cambia sin pedirla, así que
-- alguien con la sesión abierta en una compu ajena podría quedarse con la cuenta.
-- Solo compara la de la propia persona (auth.uid()); nunca devuelve el hash.
create or replace function public.verify_current_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para cambiar tu contraseña';
  end if;
  select u.encrypted_password = extensions.crypt(p_password, u.encrypted_password) into v_ok
    from auth.users u where u.id = auth.uid();
  -- Frena los intentos en serie: cada error tarda un segundo
  if not coalesce(v_ok, false) then perform pg_sleep(1); end if;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.verify_current_password(text) from public, anon;
grant execute on function public.verify_current_password(text) to authenticated;
