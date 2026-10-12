-- Clientes: una persona invitada a una obra para seguir su avance. Solo lee, y solo
-- lo que le sirve: las tareas con un estado simple (pendiente, en proceso, terminada)
-- y las fotos. No ve instrucciones, comentarios, historial ni quién hace cada tarea.

alter table public.tm_profiles drop constraint if exists tm_profiles_role_check;
alter table public.tm_profiles
  add constraint tm_profiles_role_check check (role in ('admin', 'empleado', 'cliente'));

-- Qué cliente sigue qué obra. Un cliente puede tener varias obras.
create table if not exists public.tm_project_clients (
  project_id uuid not null references public.tm_projects (id) on delete cascade,
  profile_id uuid not null references public.tm_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create index if not exists tm_project_clients_profile_idx on public.tm_project_clients (profile_id);

alter table public.tm_project_clients enable row level security;

-- Un cliente nunca es responsable de una tarea.
create or replace function private.tm_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and exists (
    select 1 from public.tm_profiles where id = new.assignee_id and role = 'cliente'
  ) then
    raise exception 'asignado';
  end if;
  return new;
end;
$$;

drop trigger if exists tm_tasks_assignee on public.tm_tasks;
create trigger tm_tasks_assignee
  before insert or update of assignee_id on public.tm_tasks
  for each row execute function private.tm_check_assignee();

-- Invita a un cliente a una obra y devuelve su perfil. Si ese correo ya es de un
-- cliente, solo lo une a la obra: una misma persona puede seguir varias.
create or replace function private.tm_invite_client(p_project uuid, p_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_p public.tm_profiles;
begin
  if not exists (select 1 from public.tm_projects where id = p_project) then
    raise exception 'obra';
  end if;
  if v_email !~ '^[^@ ]+@[^@ ]+[.][^@ ]+$' then
    raise exception 'email';
  end if;
  select * into v_p from public.tm_profiles where email = v_email;
  if found then
    if v_p.role <> 'cliente' then
      raise exception 'duplicado';
    end if;
  else
    if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
      raise exception 'nombre';
    end if;
    insert into public.tm_profiles (email, name, role, invite_code)
      values (v_email, trim(p_name), 'cliente', private.tm_code())
      returning * into v_p;
  end if;
  insert into public.tm_project_clients (project_id, profile_id)
    values (p_project, v_p.id)
    on conflict do nothing;
  return to_jsonb(v_p);
end;
$$;

-- Quita a un cliente de una obra. Si no le queda ninguna y aún no activó su cuenta,
-- se retira también la invitación.
create or replace function private.tm_remove_client(p_project uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
begin
  delete from public.tm_project_clients where project_id = p_project and profile_id = p_profile;
  if not found then
    raise exception 'no_existe';
  end if;
  delete from public.tm_profiles p
    where p.id = p_profile and p.role = 'cliente' and p.user_id is null
      and not exists (select 1 from public.tm_project_clients c where c.profile_id = p.id);
end;
$$;

-- Lo que ve un cliente: sus obras, con las tareas resumidas y las fotos. La función
-- arma la respuesta campo por campo para no entregar nada interno.
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
      where t.project_id = p.id
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
      where t.project_id = p.id
    ), '[]'::jsonb)
  ) order by p.created_at), '[]'::jsonb)
  from public.tm_projects p
  join public.tm_project_clients c on c.project_id = p.id
  where c.profile_id = private.tm_my_id();
$$;

-- Si quien llama es cliente de la obra a la que pertenece ese archivo. Solo sirve
-- para leer del almacén: subir y borrar siguen siendo del equipo.
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
    where t.id = split_part(p_path, '/', 1)::uuid and c.profile_id = private.tm_my_id()
  );
exception when others then
  return false;
end;
$$;

-- El rol de un cliente no se cambia desde Equipo, ni nadie del equipo pasa a ser cliente.
create or replace function private.tm_update_profile(p_id uuid, p_name text, p_role text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_p public.tm_profiles;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'nombre';
  end if;
  select * into v_p from public.tm_profiles where id = p_id for update;
  if not found then
    raise exception 'no_existe';
  end if;
  if coalesce(p_role, '') not in ('admin', 'empleado', 'cliente') or (v_p.role = 'cliente') <> (p_role = 'cliente') then
    raise exception 'rol';
  end if;
  if v_p.id = v_admin and (p_role <> 'admin' or not p_active) then
    raise exception 'propio';
  end if;
  if v_p.role = 'admin' and v_p.active and v_p.user_id is not null
    and (p_role <> 'admin' or not p_active)
    and (select count(*) from public.tm_profiles
         where role = 'admin' and active and user_id is not null) <= 1
  then
    raise exception 'ultimo_admin';
  end if;
  update public.tm_profiles
    set name = trim(p_name), role = p_role, active = p_active
    where id = p_id;
end;
$$;

create or replace function public.tm_invite_client(p_project uuid, p_name text, p_email text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tm_invite_client(p_project, p_name, p_email); $$;

create or replace function public.tm_remove_client(p_project uuid, p_profile uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_remove_client(p_project, p_profile); $$;

create or replace function public.tm_client_view()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tm_client_view(); $$;

revoke all on public.tm_project_clients from public, anon, authenticated;
grant select on public.tm_project_clients to authenticated;

revoke execute on function private.tm_check_assignee() from public, anon, authenticated;
revoke execute on function private.tm_invite_client(uuid, text, text) from public, anon;
revoke execute on function private.tm_remove_client(uuid, uuid) from public, anon;
revoke execute on function private.tm_client_view() from public, anon;
revoke execute on function private.tm_client_can_see_path(text) from public, anon;
revoke execute on function public.tm_invite_client(uuid, text, text) from public, anon;
revoke execute on function public.tm_remove_client(uuid, uuid) from public, anon;
revoke execute on function public.tm_client_view() from public, anon;

grant execute on function private.tm_invite_client(uuid, text, text) to authenticated;
grant execute on function private.tm_remove_client(uuid, uuid) to authenticated;
grant execute on function private.tm_client_view() to authenticated;
grant execute on function private.tm_client_can_see_path(text) to authenticated;
grant execute on function public.tm_invite_client(uuid, text, text) to authenticated;
grant execute on function public.tm_remove_client(uuid, uuid) to authenticated;
grant execute on function public.tm_client_view() to authenticated;

-- Quién está invitado a cada obra lo ve solo el administrador.
drop policy if exists tm_project_clients_select on public.tm_project_clients;
create policy tm_project_clients_select on public.tm_project_clients
  for select to authenticated
  using ((select private.tm_is_admin()));

-- El cliente puede abrir (no subir ni borrar) las fotos de su obra.
drop policy if exists tareas_select on storage.objects;
create policy tareas_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tareas'
    and (private.tm_can_see_path(name) or private.tm_client_can_see_path(name))
  );
