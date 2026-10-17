-- RESER · "Cualquiera" reparte parejo.
-- Antes asignaba siempre al primero libre por orden de alta (el primero se llevaba casi todo).
-- Ahora, entre los profesionales libres que ofrecen el servicio, elige al que tiene MENOS turnos
-- ese día (en la zona horaria del negocio); si empatan, elige al azar entre los empatados
-- (muestreo uniforme). Solo cambia la rama "sin profesional elegido" de pick_resource.

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.pick_resource(uuid, text, timestamptz, timestamptz, int, uuid, uuid)'::regprocedure);

  v_new := replace(v_def,
    'v_covered boolean := false;',
    'v_covered boolean := false;' || E'\n'
    || '  v_best uuid;' || E'\n'
    || '  v_best_load int;' || E'\n'
    || '  v_ties int := 0;' || E'\n'
    || '  v_load int;');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (declaraciones)'; end if;
  v_def := v_new;

  v_new := replace(v_def,
    'return v_candidate.id;',
    'select count(*) into v_load' || E'\n'
    || '          from public.reservations rl' || E'\n'
    || '          where rl.resource_id = v_candidate.id' || E'\n'
    || '            and rl.status <> ''cancelled''' || E'\n'
    || '            and (rl.starts_at at time zone p_timezone)::date = (p_starts_at at time zone p_timezone)::date;' || E'\n'
    || '        if v_best is null or v_load < v_best_load then' || E'\n'
    || '          v_best := v_candidate.id;' || E'\n'
    || '          v_best_load := v_load;' || E'\n'
    || '          v_ties := 1;' || E'\n'
    || '        elsif v_load = v_best_load then' || E'\n'
    || '          v_ties := v_ties + 1;' || E'\n'
    || '          if random() < 1.0 / v_ties then v_best := v_candidate.id; end if;' || E'\n'
    || '        end if;');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (asignación)'; end if;
  v_def := v_new;

  v_new := replace(v_def,
    'end loop;',
    'end loop;' || E'\n\n'
    || '  if v_best is not null then' || E'\n'
    || '    return v_best;' || E'\n'
    || '  end if;');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (cierre)'; end if;

  execute v_new;
end;
$$;
