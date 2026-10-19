-- Archivar tareas: una tarea ya no se borra de un golpe. Primero se archiva: sigue
-- guardada con su historial y sus fotos, deja de verse para el equipo y para el
-- cliente, y solo la ve el administrador, que puede restaurarla. Borrarla del todo
-- solo se permite sobre una tarea archivada.

alter table public.tm_tasks add column if not exists archived_at timestamptz;

-- Quién ve qué: las tareas archivadas (y su historial y obra) solo las ve el administrador.
drop policy if exists tm_tasks_select on public.tm_tasks;
create policy tm_tasks_select on public.tm_tasks
  for select to authenticated
  using (
    (select private.tm_is_admin())
    or (assignee_id = (select private.tm_my_id()) and archived_at is null)
  );

drop policy if exists tm_events_select on public.tm_events;
create policy tm_events_select on public.tm_events
  for select to authenticated
  using (
    (select private.tm_is_admin())
    or exists (
      select 1 from public.tm_tasks t
      where t.id = task_id and t.assignee_id = (select private.tm_my_id()) and t.archived_at is null
    )
  );

drop policy if exists tm_projects_select on public.tm_projects;
create policy tm_projects_select on public.tm_projects
  for select to authenticated
  using (
    (select private.tm_is_admin())
    or exists (
      select 1 from public.tm_tasks t
      where t.project_id = tm_projects.id and t.assignee_id = (select private.tm_my_id()) and t.archived_at is null
    )
  );

-- Si quien llama puede ver esa tarea: el administrador, todas; los demás, las suyas
-- que no estén archivadas. De aquí salen también los permisos de archivos y fotos.
create or replace function private.tm_can_see_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tm_is_admin() or exists (
    select 1 from public.tm_tasks
    where id = p_task and assignee_id = private.tm_my_id() and archived_at is null
  );
$$;

-- El cliente tampoco abre las fotos de una tarea archivada.
create or replace function private.tm_client_can_see_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.tm_tasks t
    join public.tm_project_clients c on c.project_id = t.project_id
    where t.id = split_part(p_path, '/', 1)::uuid
      and t.archived_at is null
      and c.profile_id = private.tm_my_id()
  );
exception when others then
  return false;
end;
$$;

-- Lo que ve un cliente: sus obras sin las tareas archivadas ni sus fotos.
create or replace function private.tm_client_view()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'detail', p.detail,
    'active', p.active,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'number', t.number,
        'title', t.title,
        'stage', case
          when t.status = 'completada' then 'terminada'
          when t.status in ('en_curso', 'enviada', 'en_revision', 'devuelta') then 'en_proceso'
          else 'pendiente'
        end,
        'due_date', t.due_date,
        'completed_at', t.completed_at
      ) order by t.number)
      from public.tm_tasks t
      where t.project_id = p.id and t.archived_at is null
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'task_id', f.task_id,
        'path', f.path,
        'name', f.name,
        'mime', f.mime,
        'created_at', f.created_at
      ) order by f.created_at desc)
      from public.tm_files f
      join public.tm_tasks t on t.id = f.task_id
      where t.project_id = p.id and t.archived_at is null
    ), '[]'::jsonb)
  ) order by p.created_at), '[]'::jsonb)
  from public.tm_projects p
  join public.tm_project_clients c on c.project_id = p.id
  where c.profile_id = private.tm_my_id();
$$;

-- Al quitar una invitación pendiente, sus tareas vuelven a "borrador"; las archivadas
-- no se tocan (solo pierden al responsable cuando se borra el perfil).
create or replace function private.tm_remove_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
begin
  if not exists (select 1 from public.tm_profiles where id = p_id and user_id is null) then
    raise exception 'activa';
  end if;
  update public.tm_tasks
    set assignee_id = null, status = 'borrador', updated_at = now()
    where assignee_id = p_id and status <> 'completada' and archived_at is null;
  delete from public.tm_profiles where id = p_id and user_id is null;
end;
$$;

-- Una tarea archivada no se modifica: ni pasos, ni comentarios, ni ediciones. Lo único
-- que puede cambiar es restaurarla, o que se borre la persona que era responsable
-- (la base de datos la deja sin responsable).
create or replace function private.tm_freeze_archived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is not null
    and (to_jsonb(new) - 'assignee_id' - 'created_by') is distinct from (to_jsonb(old) - 'assignee_id' - 'created_by')
  then
    raise exception 'archivada';
  end if;
  return new;
end;
$$;

drop trigger if exists tm_tasks_freeze on public.tm_tasks;
create trigger tm_tasks_freeze
  before update on public.tm_tasks
  for each row execute function private.tm_freeze_archived();

-- Tampoco se adjuntan archivos a una tarea archivada.
create or replace function private.tm_block_archived_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tm_tasks where id = new.task_id and archived_at is not null) then
    raise exception 'archivada';
  end if;
  return new;
end;
$$;

drop trigger if exists tm_files_block_archived on public.tm_files;
create trigger tm_files_block_archived
  before insert on public.tm_files
  for each row execute function private.tm_block_archived_files();

-- Archiva (p_archive = true) o restaura una tarea y lo deja en su historial.
create or replace function private.tm_archive_task(p_id uuid, p_archive boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_want boolean := coalesce(p_archive, false);
  v_p public.tm_profiles;
  v_t public.tm_tasks;
begin
  select * into v_t from public.tm_tasks where id = p_id for update;
  if not found then
    raise exception 'no_existe';
  end if;
  -- Ya está como se pide: no hay nada que cambiar ni que anotar.
  if (v_t.archived_at is not null) = v_want then
    return;
  end if;
  select * into v_p from public.tm_profiles where id = v_admin;
  update public.tm_tasks
    set archived_at = case when v_want then now() else null end, updated_at = now()
    where id = p_id;
  insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, from_status, to_status, note)
    values (p_id, v_admin, v_p.name, v_p.role, case when v_want then 'archivar' else 'restaurar' end, v_t.status, v_t.status, '');
end;
$$;

-- Borrar del todo: solo una tarea archivada (se lleva su historial y sus archivos).
-- Las fotos del almacén las quita la aplicación antes de llamar a esta función.
create or replace function private.tm_delete_task(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_archived timestamptz;
begin
  select archived_at into v_archived from public.tm_tasks where id = p_id;
  if not found then
    raise exception 'no_existe';
  end if;
  if v_archived is null then
    raise exception 'no_archivada';
  end if;
  delete from public.tm_tasks where id = p_id;
end;
$$;

create or replace function public.tm_archive_task(p_id uuid, p_archive boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_archive_task(p_id, p_archive); $$;

revoke execute on function private.tm_freeze_archived() from public, anon, authenticated;
revoke execute on function private.tm_block_archived_files() from public, anon, authenticated;
revoke execute on function private.tm_archive_task(uuid, boolean) from public, anon;
revoke execute on function public.tm_archive_task(uuid, boolean) from public, anon;

grant execute on function private.tm_archive_task(uuid, boolean) to authenticated;
grant execute on function public.tm_archive_task(uuid, boolean) to authenticated;
