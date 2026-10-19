-- RESER · Enlace de equipo: el dueño manda un solo enlace y cada persona que se une aparece sola en Equipo.
--
-- Hasta la 029, la invitación iba atada a un profesional ya cargado (staff_invites.resource_id). Ahora también existe
-- la invitación "abierta" del negocio (resource_id null, una por negocio, sirve para varias personas mientras no
-- venza): al aceptarla se crea el perfil del profesional con el nombre de su cuenta, SIN servicios asignados, para
-- que el dueño elija qué ofrece. Sin servicios no aparece en la página de reservas, así que nadie puede reservarle
-- hasta que el dueño lo configure. Sus horarios los carga él mismo desde "Mis horarios" (o el dueño). Idempotente.

alter table public.staff_invites alter column resource_id drop not null;
create unique index if not exists staff_invites_open_per_business on public.staff_invites (business_id) where resource_id is null;

-- El dueño crea (o renueva) el enlace de equipo. El anterior deja de servir.
create or replace function public.create_team_invite(p_business_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para invitar a tu equipo';
  end if;
  if not exists (select 1 from businesses where id = p_business_id and owner_id = auth.uid()) then
    raise exception 'No tenés permiso sobre este negocio';
  end if;

  delete from staff_invites where business_id = p_business_id and resource_id is null;
  insert into staff_invites (business_id, resource_id)
    values (p_business_id, null)
    returning token into v_token;
  return json_build_object('token', v_token);
end;
$$;

create or replace function public.get_staff_invite(p_token uuid)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
      'business_name', b.name,
      'professional_name', r.name, -- null en el enlace de equipo
      'logo_path', b.logo_path,
      'open', i.resource_id is null,
      'expired', i.expires_at < now()
    ) into v_result
    from staff_invites i
    join businesses b on b.id = i.business_id
    left join resources r on r.id = i.resource_id
    where i.token = p_token;
  if v_result is null then
    raise exception 'Esta invitación ya no es válida';
  end if;
  return v_result;
end;
$$;

create or replace function public.accept_staff_invite(p_token uuid)
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
  if auth.uid() is null then
    raise exception 'Iniciá sesión para aceptar la invitación';
  end if;

  select * into v_invite from staff_invites where token = p_token for update;
  if not found then
    raise exception 'Esta invitación ya no es válida';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Esta invitación venció. Pedile al dueño del negocio un enlace nuevo';
  end if;
  if exists (select 1 from businesses where owner_id = auth.uid()) then
    raise exception 'Esta cuenta ya es dueña de un negocio en RESER. Para sumarte como profesional usá otra cuenta';
  end if;

  select * into v_current from staff_members where user_id = auth.uid();
  if found then
    -- Volvió a abrir el enlace con la cuenta que ya está en este equipo: no se duplica nada.
    if v_current.business_id = v_invite.business_id
       and (v_invite.resource_id is null or v_current.resource_id = v_invite.resource_id) then
      if v_invite.resource_id is not null then
        delete from staff_invites where token = p_token;
      end if;
      return json_build_object('business_id', v_current.business_id, 'resource_id', v_current.resource_id);
    end if;
    raise exception 'Esta cuenta ya forma parte de otro equipo en RESER';
  end if;

  select u.email into v_email from auth.users u where u.id = auth.uid();

  if v_invite.resource_id is null then
    -- Enlace de equipo: el perfil se crea con el nombre de la cuenta y sin servicios (los elige el dueño).
    select nullif(btrim(p.full_name), '') into v_name from profiles p where p.id = auth.uid();
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
    values (v_resource_id, v_invite.business_id, auth.uid(), v_email);
  return json_build_object('business_id', v_invite.business_id, 'resource_id', v_resource_id);
end;
$$;

revoke all on function public.create_team_invite(uuid) from public, anon, authenticated;
grant execute on function public.create_team_invite(uuid) to authenticated;

comment on table public.staff_invites is 'Invitaciones al panel: con resource_id = vincula un profesional ya cargado (un solo uso); con resource_id null = enlace de equipo del negocio (varias personas, cada una crea su perfil). Vencen a los 7 días.';
