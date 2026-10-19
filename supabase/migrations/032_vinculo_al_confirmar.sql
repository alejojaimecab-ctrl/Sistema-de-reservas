-- RESER · Quien se registra desde un enlace de invitación queda vinculado al equipo solo, al confirmar su email.
--
-- Antes había que volver a /unirme/<token> después de confirmar y tocar "Unirme": si la persona confirmaba desde
-- otro dispositivo (o el mail la dejaba en el inicio) nunca quedaba vinculada y el dueño no la veía en Equipo.
-- Ahora la app guarda el token en los metadatos de la cuenta nueva (join_token) y la base hace el vínculo apenas el
-- email queda confirmado (o en el alta, si la confirmación está desactivada). Con el enlace de equipo se crea el
-- perfil sin servicios, para que el dueño elija qué ofrece. Las cuentas que ya existían siguen aceptando con el
-- botón "Unirme al equipo". Idempotente.

-- La lógica de aceptar, para un usuario dado. No se expone: la usan accept_staff_invite y el disparador.
create or replace function private.link_staff(p_user_id uuid, p_token uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_invite staff_invites%rowtype;
  v_current staff_members%rowtype;
  v_resource_id uuid;
  v_name text;
  v_email text;
begin
  select * into v_invite from staff_invites where token = p_token for update;
  if not found then
    raise exception 'Esta invitación ya no es válida';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Esta invitación venció. Pedile al dueño del negocio un enlace nuevo';
  end if;
  if exists (select 1 from businesses where owner_id = p_user_id) then
    raise exception 'Esta cuenta ya es dueña de un negocio en RESER. Para sumarte como profesional usá otra cuenta';
  end if;

  select * into v_current from staff_members where user_id = p_user_id;
  if found then
    -- Ya está en este equipo (volvió a abrir el enlace): no se duplica nada.
    if v_current.business_id = v_invite.business_id
       and (v_invite.resource_id is null or v_current.resource_id = v_invite.resource_id) then
      if v_invite.resource_id is not null then
        delete from staff_invites where token = p_token;
      end if;
      return json_build_object('business_id', v_current.business_id, 'resource_id', v_current.resource_id);
    end if;
    raise exception 'Esta cuenta ya forma parte de otro equipo en RESER';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;

  if v_invite.resource_id is null then
    -- Enlace de equipo: el perfil se crea con el nombre de la cuenta y sin servicios (los elige el dueño).
    select nullif(btrim(p.full_name), '') into v_name from profiles p where p.id = p_user_id;
    v_name := left(coalesce(v_name, nullif(split_part(v_email, '@', 1), ''), 'Profesional'), 60);
    insert into resources (business_id, name) values (v_invite.business_id, v_name) returning id into v_resource_id;
    delete from resource_services where resource_id = v_resource_id; -- el trigger le asigna todos: se quitan
  else
    if exists (select 1 from staff_members where resource_id = v_invite.resource_id) then
      raise exception 'Ese profesional ya tiene una cuenta vinculada';
    end if;
    v_resource_id := v_invite.resource_id;
    delete from staff_invites where token = p_token; -- la invitación de un perfil sirve una sola vez
  end if;

  insert into staff_members (resource_id, business_id, user_id, email)
    values (v_resource_id, v_invite.business_id, p_user_id, v_email);
  return json_build_object('business_id', v_invite.business_id, 'resource_id', v_resource_id);
end;
$$;
revoke all on function private.link_staff(uuid, uuid) from public, anon, authenticated;

create or replace function public.accept_staff_invite(p_token uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para aceptar la invitación';
  end if;
  return private.link_staff(auth.uid(), p_token);
end;
$$;

-- Al confirmar el email (o en el alta, si ya viene confirmado) se usa el join_token que guardó la app al registrarse.
create or replace function private.link_invited_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new; -- solo la primera confirmación
  end if;
  begin
    v_token := nullif(new.raw_user_meta_data ->> 'join_token', '')::uuid;
  exception when others then
    return new;
  end;
  if v_token is null then
    return new;
  end if;

  -- Si la invitación venció o ya no sirve, la cuenta se crea igual (sin equipo): nunca se frena una confirmación.
  begin
    perform private.link_staff(new.id, v_token);
  exception when others then
    raise warning 'No se pudo sumar la cuenta % al equipo: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function private.link_invited_user() from public, anon, authenticated;
-- Supabase Auth (supabase_auth_admin) es quien confirma el email: necesita ver el esquema del disparador.
grant usage on schema private to supabase_auth_admin;

-- El nombre hace que corra después de on_auth_user_created (que crea el perfil con el nombre de la persona).
drop trigger if exists on_auth_user_joins_team on auth.users;
create trigger on_auth_user_joins_team
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.link_invited_user();
