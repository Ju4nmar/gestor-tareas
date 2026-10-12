-- Obras y archivos adjuntos. Las tareas se agrupan por obra y pueden llevar fotos
-- o planos, guardados en un almacén privado: solo los ve quien puede ver la tarea.
-- (En una instalación nueva no hace falta: supabase/schema.sql ya lo incluye.)

create table if not exists public.tm_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  detail text not null default '' check (char_length(detail) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tm_tasks
  add column if not exists project_id uuid references public.tm_projects (id) on delete set null;

create index if not exists tm_tasks_project_idx on public.tm_tasks (project_id);

create table if not exists public.tm_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tm_tasks (id) on delete cascade,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null default '',
  size int not null default 0 check (size between 0 and 15728640),
  uploaded_by uuid references public.tm_profiles (id) on delete set null,
  uploader_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists tm_files_task_idx on public.tm_files (task_id);

alter table public.tm_projects enable row level security;
alter table public.tm_files enable row level security;

-- Si quien llama puede ver esa tarea: el administrador, todas; los demás, las suyas.
create or replace function private.tm_can_see_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tm_is_admin() or exists (
    select 1 from public.tm_tasks
    where id = p_task and assignee_id = private.tm_my_id()
  );
$$;

-- Lo mismo a partir de la ruta de un archivo, que empieza por el id de su tarea.
create or replace function private.tm_can_see_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.tm_can_see_task(split_part(p_path, '/', 1)::uuid);
exception when others then
  return false;
end;
$$;

create or replace function private.tm_save_project(p_id uuid, p_name text, p_detail text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_id uuid;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'nombre';
  end if;
  if p_id is null then
    insert into public.tm_projects (name, detail)
      values (trim(p_name), left(trim(coalesce(p_detail, '')), 200))
      returning id into v_id;
    return v_id;
  end if;
  update public.tm_projects
    set name = trim(p_name), detail = left(trim(coalesce(p_detail, '')), 200), active = p_active
    where id = p_id;
  if not found then
    raise exception 'no_existe';
  end if;
  return p_id;
end;
$$;

-- Solo se borra una obra vacía; con tareas, se archiva.
create or replace function private.tm_delete_project(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
begin
  if exists (select 1 from public.tm_tasks where project_id = p_id) then
    raise exception 'con_tareas';
  end if;
  delete from public.tm_projects where id = p_id;
end;
$$;

-- Anota un archivo que ya se subió al almacén. Lo puede adjuntar el administrador
-- o la persona responsable de la tarea.
create or replace function private.tm_add_file(p_task uuid, p_path text, p_name text, p_mime text, p_size int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.tm_my_id();
  v_p public.tm_profiles;
  v_t public.tm_tasks;
  v_id uuid;
begin
  if v_me is null or not private.tm_can_see_task(p_task) then
    raise exception 'permiso';
  end if;
  if p_path not like p_task::text || '/%' or char_length(trim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'archivo';
  end if;
  select * into v_p from public.tm_profiles where id = v_me;
  select * into v_t from public.tm_tasks where id = p_task;
  insert into public.tm_files (task_id, path, name, mime, size, uploaded_by, uploader_name)
    values (p_task, p_path, trim(p_name), coalesce(p_mime, ''), coalesce(p_size, 0), v_me, v_p.name)
    returning id into v_id;
  update public.tm_tasks set updated_at = now() where id = p_task;
  insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, from_status, to_status, note)
    values (p_task, v_me, v_p.name, v_p.role, 'adjuntar', v_t.status, v_t.status, trim(p_name));
  return v_id;
end;
$$;

-- Quita un archivo: el administrador o quien lo subió. Devuelve su ruta para
-- borrarlo también del almacén.
create or replace function private.tm_remove_file(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.tm_my_id();
  v_f public.tm_files;
begin
  select * into v_f from public.tm_files where id = p_id;
  if not found then
    raise exception 'no_existe';
  end if;
  if v_me is null or not (private.tm_is_admin() or v_f.uploaded_by = v_me) then
    raise exception 'permiso';
  end if;
  delete from public.tm_files where id = p_id;
  return v_f.path;
end;
$$;

-- La tarea ahora lleva obra: se reemplaza la función de guardar por una con ese dato.
drop function if exists public.tm_save_task(uuid, text, text, text, date, uuid);
drop function if exists private.tm_save_task(uuid, text, text, text, date, uuid);

create or replace function private.tm_save_task(
  p_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due date,
  p_assignee uuid,
  p_project uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_name text;
  v_title text := trim(coalesce(p_title, ''));
  v_desc text := coalesce(p_description, '');
  v_asg text;
  v_t public.tm_tasks;
  v_changes text[] := '{}';
  v_status text;
  v_moved boolean;
begin
  if char_length(v_title) not between 3 and 140 then
    raise exception 'titulo';
  end if;
  if char_length(v_desc) > 5000 then
    raise exception 'descripcion';
  end if;
  if p_priority not in ('baja', 'media', 'alta', 'urgente') then
    raise exception 'prioridad';
  end if;
  if p_assignee is not null then
    select name into v_asg from public.tm_profiles where id = p_assignee and active;
    if not found then
      raise exception 'asignado';
    end if;
  end if;
  if p_project is not null and not exists (select 1 from public.tm_projects where id = p_project) then
    raise exception 'obra';
  end if;
  select name into v_name from public.tm_profiles where id = v_admin;

  if p_id is null then
    insert into public.tm_tasks (title, description, priority, due_date, assignee_id, project_id, status, created_by)
      values (v_title, v_desc, p_priority, p_due, p_assignee, p_project,
              case when p_assignee is null then 'borrador' else 'asignada' end, v_admin)
      returning * into v_t;
    insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, to_status)
      values (v_t.id, v_admin, v_name, 'admin', 'crear', 'borrador');
    if p_assignee is not null then
      insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, from_status, to_status, note)
        values (v_t.id, v_admin, v_name, 'admin', 'asignar', 'borrador', 'asignada', v_asg);
    end if;
    return v_t.id;
  end if;

  select * into v_t from public.tm_tasks where id = p_id for update;
  if not found then
    raise exception 'no_existe';
  end if;
  v_moved := v_t.assignee_id is distinct from p_assignee;
  if v_moved and v_t.status = 'completada' then
    raise exception 'completada';
  end if;
  if v_t.title <> v_title then v_changes := v_changes || 'titulo'; end if;
  if v_t.description <> v_desc then v_changes := v_changes || 'descripcion'; end if;
  if v_t.priority <> p_priority then v_changes := v_changes || 'prioridad'; end if;
  if v_t.due_date is distinct from p_due then v_changes := v_changes || 'vence'; end if;
  if v_t.project_id is distinct from p_project then v_changes := v_changes || 'obra'; end if;
  v_status := case
    when not v_moved then v_t.status
    when p_assignee is null then 'borrador'
    else 'asignada'
  end;
  update public.tm_tasks
    set title = v_title, description = v_desc, priority = p_priority, due_date = p_due,
        assignee_id = p_assignee, project_id = p_project, status = v_status, updated_at = now()
    where id = p_id;
  if array_length(v_changes, 1) > 0 then
    insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, from_status, to_status, note)
      values (p_id, v_admin, v_name, 'admin', 'editar', v_t.status, v_t.status, array_to_string(v_changes, ','));
  end if;
  if v_moved then
    insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, from_status, to_status, note)
      values (p_id, v_admin, v_name, 'admin',
              case when p_assignee is null then 'desasignar'
                   when v_t.assignee_id is null then 'asignar'
                   else 'reasignar' end,
              v_t.status, v_status, coalesce(v_asg, ''));
  end if;
  return p_id;
end;
$$;

create or replace function public.tm_save_task(p_id uuid, p_title text, p_description text, p_priority text, p_due date, p_assignee uuid, p_project uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.tm_save_task(p_id, p_title, p_description, p_priority, p_due, p_assignee, p_project); $$;

create or replace function public.tm_save_project(p_id uuid, p_name text, p_detail text, p_active boolean)
returns uuid language sql security invoker set search_path = ''
as $$ select private.tm_save_project(p_id, p_name, p_detail, p_active); $$;

create or replace function public.tm_delete_project(p_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_delete_project(p_id); $$;

create or replace function public.tm_add_file(p_task uuid, p_path text, p_name text, p_mime text, p_size int)
returns uuid language sql security invoker set search_path = ''
as $$ select private.tm_add_file(p_task, p_path, p_name, p_mime, p_size); $$;

create or replace function public.tm_remove_file(p_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select private.tm_remove_file(p_id); $$;

-- Permisos.
revoke all on public.tm_projects, public.tm_files from public, anon, authenticated;
grant select on public.tm_projects, public.tm_files to authenticated;

revoke execute on function private.tm_can_see_task(uuid) from public, anon;
revoke execute on function private.tm_can_see_path(text) from public, anon;
revoke execute on function private.tm_save_project(uuid, text, text, boolean) from public, anon;
revoke execute on function private.tm_delete_project(uuid) from public, anon;
revoke execute on function private.tm_add_file(uuid, text, text, text, int) from public, anon;
revoke execute on function private.tm_remove_file(uuid) from public, anon;
revoke execute on function private.tm_save_task(uuid, text, text, text, date, uuid, uuid) from public, anon;
revoke execute on function public.tm_save_project(uuid, text, text, boolean) from public, anon;
revoke execute on function public.tm_delete_project(uuid) from public, anon;
revoke execute on function public.tm_add_file(uuid, text, text, text, int) from public, anon;
revoke execute on function public.tm_remove_file(uuid) from public, anon;
revoke execute on function public.tm_save_task(uuid, text, text, text, date, uuid, uuid) from public, anon;

grant execute on function private.tm_can_see_task(uuid) to authenticated;
grant execute on function private.tm_can_see_path(text) to authenticated;
grant execute on function private.tm_save_project(uuid, text, text, boolean) to authenticated;
grant execute on function private.tm_delete_project(uuid) to authenticated;
grant execute on function private.tm_add_file(uuid, text, text, text, int) to authenticated;
grant execute on function private.tm_remove_file(uuid) to authenticated;
grant execute on function private.tm_save_task(uuid, text, text, text, date, uuid, uuid) to authenticated;
grant execute on function public.tm_save_project(uuid, text, text, boolean) to authenticated;
grant execute on function public.tm_delete_project(uuid) to authenticated;
grant execute on function public.tm_add_file(uuid, text, text, text, int) to authenticated;
grant execute on function public.tm_remove_file(uuid) to authenticated;
grant execute on function public.tm_save_task(uuid, text, text, text, date, uuid, uuid) to authenticated;

-- Una obra la ve el administrador y quien tenga alguna tarea en ella.
drop policy if exists tm_projects_select on public.tm_projects;
create policy tm_projects_select on public.tm_projects
  for select to authenticated
  using (
    (select private.tm_is_admin())
    or exists (
      select 1 from public.tm_tasks t
      where t.project_id = tm_projects.id and t.assignee_id = (select private.tm_my_id())
    )
  );

drop policy if exists tm_files_select on public.tm_files;
create policy tm_files_select on public.tm_files
  for select to authenticated
  using (private.tm_can_see_task(task_id));

-- Almacén privado para fotos y planos (hasta 15 MB cada uno).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tareas', 'tareas', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists tareas_select on storage.objects;
create policy tareas_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tareas' and private.tm_can_see_path(name));

drop policy if exists tareas_insert on storage.objects;
create policy tareas_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tareas' and private.tm_can_see_path(name));

drop policy if exists tareas_delete on storage.objects;
create policy tareas_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tareas' and ((select private.tm_is_admin()) or owner_id = (select auth.uid())::text));
