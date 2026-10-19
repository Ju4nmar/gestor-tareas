-- Esquema del gestor de tareas. Se pega completo en el SQL Editor de Supabase.
-- Es idempotente: se puede ejecutar más de una vez sin dañar datos.
--
-- Si el proyecto de Supabase ya tiene alguno de los otros productos (tienda, sitio, menú o agenda), la PARTE 1
-- ya existe allí con las mismas definiciones: basta con ejecutar la PARTE 2.

-- ===========================================================================
-- PARTE 1 · Quién es administrador
-- ===========================================================================

create schema if not exists private;

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- El primer usuario que entra al panel queda como administrador.
-- Después de eso la función ya no agrega a nadie más.
create or replace function private.claim_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return false;
  end if;
  lock table public.admins in exclusive mode;
  if exists (select 1 from public.admins) then
    return exists (select 1 from public.admins where user_id = v_uid);
  end if;
  insert into public.admins (user_id) values (v_uid);
  return true;
end;
$$;

create or replace function public.claim_admin()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.claim_admin();
$$;

grant usage on schema private to anon, authenticated;

revoke execute on function public.is_admin() from public;
revoke execute on function public.claim_admin() from public;
revoke execute on function private.claim_admin() from public;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.claim_admin() from anon;
revoke execute on function private.claim_admin() from anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.claim_admin() to authenticated;
grant execute on function private.claim_admin() to authenticated;

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

drop policy if exists admins_select_own on public.admins;
create policy admins_select_own on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ===========================================================================
-- PARTE 2 · Gestor de tareas
-- ===========================================================================
-- Nadie escribe directo en estas tablas: todo cambio pasa por las funciones de
-- abajo, que comprueban quién llama y dejan el paso en el historial. Los errores
-- se devuelven como claves que la aplicación traduce (ver src/lib/textos.ts).

-- Personas del equipo. `user_id` queda vacío hasta que activan su invitación.
create table if not exists public.tm_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique check (email = lower(email) and email ~ '^[^@ ]+@[^@ ]+[.][^@ ]+$'),
  name text not null check (char_length(name) between 2 and 80),
  role text not null default 'empleado' check (role in ('admin', 'empleado')),
  active boolean not null default true,
  invite_code text unique,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create sequence if not exists public.tm_task_number;

create table if not exists public.tm_tasks (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('public.tm_task_number'),
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 5000),
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta', 'urgente')),
  due_date date,
  assignee_id uuid references public.tm_profiles (id) on delete set null,
  status text not null default 'borrador' check (status in (
    'borrador', 'asignada', 'aclaracion', 'aceptada', 'en_curso',
    'enviada', 'en_revision', 'devuelta', 'completada'
  )),
  created_by uuid references public.tm_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tm_tasks_assignee_idx on public.tm_tasks (assignee_id);

-- Historial: cada paso de cada tarea, con quién lo dio y su nota.
create table if not exists public.tm_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tm_tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_id uuid references public.tm_profiles (id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  from_status text,
  to_status text,
  note text not null default '' check (char_length(note) <= 2000)
);

create index if not exists tm_events_task_idx on public.tm_events (task_id, created_at);

alter table public.tm_profiles enable row level security;
alter table public.tm_tasks enable row level security;
alter table public.tm_events enable row level security;

-- Quién soy: se usan en las políticas, por eso leen la tabla sin pasar por ellas.
create or replace function private.tm_my_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.tm_profiles where user_id = (select auth.uid()) and active;
$$;

create or replace function private.tm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tm_profiles
    where user_id = (select auth.uid()) and active and role = 'admin'
  );
$$;

-- Devuelve el perfil del administrador que llama, o rechaza la operación.
create or replace function private.tm_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.tm_profiles
    where user_id = (select auth.uid()) and active and role = 'admin';
  if v_id is null then
    raise exception 'permiso';
  end if;
  return v_id;
end;
$$;

-- Código de invitación de diez caracteres.
create or replace function private.tm_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
begin
  for n in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, n) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- Entrada a la aplicación: devuelve el perfil de quien inició sesión. El dueño de
-- la instalación (el primer usuario, ver PARTE 1) queda como administrador.
create or replace function private.tm_enter()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_p public.tm_profiles;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_p from public.tm_profiles where user_id = v_uid;
  if found then
    return to_jsonb(v_p) - 'invite_code';
  end if;
  if v_email <> '' and private.claim_admin() then
    insert into public.tm_profiles (user_id, email, name, role, activated_at)
    values (v_uid, v_email, initcap(split_part(v_email, '@', 1)), 'admin', now())
    on conflict (email) do update
      set user_id = excluded.user_id, role = 'admin', active = true,
          activated_at = now(), invite_code = null
    returning * into v_p;
    return to_jsonb(v_p) - 'invite_code';
  end if;
  return null;
end;
$$;

-- A quién pertenece una invitación pendiente (para saludar en la página de activación).
create or replace function private.tm_invite_info(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', name, 'email', email)
  from public.tm_profiles
  where invite_code = upper(trim(p_code)) and user_id is null and active;
$$;

-- Une la cuenta recién creada con su invitación. Exige el código y el mismo correo.
create or replace function private.tm_activate(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_p public.tm_profiles;
begin
  if v_uid is null then
    raise exception 'sesion';
  end if;
  if exists (select 1 from public.tm_profiles where user_id = v_uid) then
    raise exception 'ya_activa';
  end if;
  update public.tm_profiles
    set user_id = v_uid, activated_at = now(), invite_code = null
    where invite_code = upper(trim(p_code)) and user_id is null and active and email = v_email
    returning * into v_p;
  if not found then
    raise exception 'invitacion';
  end if;
  return to_jsonb(v_p) - 'invite_code';
end;
$$;

create or replace function private.tm_invite(p_name text, p_email text, p_role text)
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
  if v_email !~ '^[^@ ]+@[^@ ]+[.][^@ ]+$' then
    raise exception 'email';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'nombre';
  end if;
  if p_role not in ('admin', 'empleado') then
    raise exception 'rol';
  end if;
  if exists (select 1 from public.tm_profiles where email = v_email) then
    raise exception 'duplicado';
  end if;
  insert into public.tm_profiles (email, name, role, invite_code)
    values (v_email, trim(p_name), p_role, private.tm_code())
    returning * into v_p;
  return to_jsonb(v_p);
end;
$$;

-- Cambia nombre, rol o acceso de una persona. No deja al equipo sin administrador.
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
  if p_role not in ('admin', 'empleado') then
    raise exception 'rol';
  end if;
  select * into v_p from public.tm_profiles where id = p_id for update;
  if not found then
    raise exception 'no_existe';
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

-- Retira una invitación que nadie ha activado. Sus tareas vuelven a quedar sin asignar.
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
    where assignee_id = p_id and status <> 'completada';
  delete from public.tm_profiles where id = p_id and user_id is null;
end;
$$;

-- Crea una tarea (p_id nulo) o la edita. Cambiar de responsable la deja de nuevo
-- en "asignada" para que la nueva persona la acepte.
create or replace function private.tm_save_task(
  p_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due date,
  p_assignee uuid
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
  select name into v_name from public.tm_profiles where id = v_admin;

  if p_id is null then
    insert into public.tm_tasks (title, description, priority, due_date, assignee_id, status, created_by)
      values (v_title, v_desc, p_priority, p_due, p_assignee,
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
  v_status := case
    when not v_moved then v_t.status
    when p_assignee is null then 'borrador'
    else 'asignada'
  end;
  update public.tm_tasks
    set title = v_title, description = v_desc, priority = p_priority, due_date = p_due,
        assignee_id = p_assignee, status = v_status, updated_at = now()
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

create or replace function private.tm_delete_task(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
begin
  delete from public.tm_tasks where id = p_id;
  if not found then
    raise exception 'no_existe';
  end if;
end;
$$;

-- El flujo de trabajo. Cada paso solo es válido para quien corresponde y desde
-- ciertos estados; las mismas reglas están en src/lib/flujo.ts.
create or replace function private.tm_act(p_task uuid, p_action text, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.tm_my_id();
  v_p public.tm_profiles;
  v_t public.tm_tasks;
  v_note text := trim(coalesce(p_note, ''));
  v_mine boolean;
  v_admin boolean;
  v_to text;
begin
  if v_me is null then
    raise exception 'permiso';
  end if;
  select * into v_p from public.tm_profiles where id = v_me;
  select * into v_t from public.tm_tasks where id = p_task for update;
  if not found then
    raise exception 'no_existe';
  end if;
  v_mine := coalesce(v_t.assignee_id = v_me, false);
  v_admin := v_p.role = 'admin';
  if not (v_mine or v_admin) then
    raise exception 'permiso';
  end if;
  v_to := case
    when p_action = 'aceptar' and v_mine and v_t.status = 'asignada' then 'aceptada'
    when p_action = 'aclarar' and v_mine and v_t.status in ('asignada', 'aceptada', 'en_curso', 'devuelta') then 'aclaracion'
    when p_action = 'iniciar' and v_mine and v_t.status in ('aceptada', 'devuelta') then 'en_curso'
    when p_action = 'enviar' and v_mine and v_t.status = 'en_curso' then 'enviada'
    when p_action = 'responder' and v_admin and v_t.status = 'aclaracion' then 'asignada'
    when p_action = 'revisar' and v_admin and v_t.status = 'enviada' then 'en_revision'
    when p_action = 'aprobar' and v_admin and v_t.status in ('enviada', 'en_revision') then 'completada'
    when p_action = 'devolver' and v_admin and v_t.status in ('enviada', 'en_revision') then 'devuelta'
    when p_action = 'reabrir' and v_admin and v_t.status = 'completada' then 'devuelta'
    when p_action = 'comentar' then v_t.status
  end;
  if v_to is null then
    raise exception 'transicion';
  end if;
  if char_length(v_note) > 2000
    or (p_action in ('aclarar', 'responder', 'devolver', 'reabrir', 'comentar') and char_length(v_note) < 3)
  then
    raise exception 'nota';
  end if;
  update public.tm_tasks
    set status = v_to, updated_at = now(),
        completed_at = case
          when p_action = 'aprobar' then now()
          when p_action = 'reabrir' then null
          else completed_at
        end
    where id = p_task;
  insert into public.tm_events (task_id, actor_id, actor_name, actor_role, action, from_status, to_status, note)
    values (p_task, v_me, v_p.name, v_p.role, p_action, v_t.status, v_to, v_note);
  return v_to;
end;
$$;

-- Lo que la aplicación llama: funciones sin privilegios que delegan en las de arriba.
create or replace function public.tm_enter()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tm_enter(); $$;

create or replace function public.tm_invite_info(p_code text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.tm_invite_info(p_code); $$;

create or replace function public.tm_activate(p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tm_activate(p_code); $$;

create or replace function public.tm_invite(p_name text, p_email text, p_role text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tm_invite(p_name, p_email, p_role); $$;

create or replace function public.tm_update_profile(p_id uuid, p_name text, p_role text, p_active boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_update_profile(p_id, p_name, p_role, p_active); $$;

create or replace function public.tm_remove_invite(p_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_remove_invite(p_id); $$;

create or replace function public.tm_save_task(p_id uuid, p_title text, p_description text, p_priority text, p_due date, p_assignee uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.tm_save_task(p_id, p_title, p_description, p_priority, p_due, p_assignee); $$;

create or replace function public.tm_delete_task(p_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_delete_task(p_id); $$;

create or replace function public.tm_act(p_task uuid, p_action text, p_note text)
returns text language sql security invoker set search_path = ''
as $$ select private.tm_act(p_task, p_action, p_note); $$;

-- Permisos: las tablas solo se pueden leer, y solo con sesión.
revoke all on public.tm_profiles, public.tm_tasks, public.tm_events from public, anon, authenticated;
revoke all on sequence public.tm_task_number from public, anon, authenticated;
grant select on public.tm_profiles, public.tm_tasks, public.tm_events to authenticated;

revoke execute on function private.tm_my_id() from public, anon;
revoke execute on function private.tm_is_admin() from public, anon;
revoke execute on function private.tm_require_admin() from public, anon;
revoke execute on function private.tm_code() from public, anon;
revoke execute on function private.tm_enter() from public, anon;
revoke execute on function private.tm_invite_info(text) from public;
revoke execute on function private.tm_activate(text) from public, anon;
revoke execute on function private.tm_invite(text, text, text) from public, anon;
revoke execute on function private.tm_update_profile(uuid, text, text, boolean) from public, anon;
revoke execute on function private.tm_remove_invite(uuid) from public, anon;
revoke execute on function private.tm_save_task(uuid, text, text, text, date, uuid) from public, anon;
revoke execute on function private.tm_delete_task(uuid) from public, anon;
revoke execute on function private.tm_act(uuid, text, text) from public, anon;
revoke execute on function public.tm_enter() from public, anon;
revoke execute on function public.tm_invite_info(text) from public;
revoke execute on function public.tm_activate(text) from public, anon;
revoke execute on function public.tm_invite(text, text, text) from public, anon;
revoke execute on function public.tm_update_profile(uuid, text, text, boolean) from public, anon;
revoke execute on function public.tm_remove_invite(uuid) from public, anon;
revoke execute on function public.tm_save_task(uuid, text, text, text, date, uuid) from public, anon;
revoke execute on function public.tm_delete_task(uuid) from public, anon;
revoke execute on function public.tm_act(uuid, text, text) from public, anon;

grant execute on function private.tm_my_id() to authenticated;
grant execute on function private.tm_is_admin() to authenticated;
grant execute on function private.tm_require_admin() to authenticated;
grant execute on function private.tm_code() to authenticated;
grant execute on function private.tm_enter() to authenticated;
grant execute on function private.tm_invite_info(text) to anon, authenticated;
grant execute on function private.tm_activate(text) to authenticated;
grant execute on function private.tm_invite(text, text, text) to authenticated;
grant execute on function private.tm_update_profile(uuid, text, text, boolean) to authenticated;
grant execute on function private.tm_remove_invite(uuid) to authenticated;
grant execute on function private.tm_save_task(uuid, text, text, text, date, uuid) to authenticated;
grant execute on function private.tm_delete_task(uuid) to authenticated;
grant execute on function private.tm_act(uuid, text, text) to authenticated;
grant execute on function public.tm_enter() to authenticated;
grant execute on function public.tm_invite_info(text) to anon, authenticated;
grant execute on function public.tm_activate(text) to authenticated;
grant execute on function public.tm_invite(text, text, text) to authenticated;
grant execute on function public.tm_update_profile(uuid, text, text, boolean) to authenticated;
grant execute on function public.tm_remove_invite(uuid) to authenticated;
grant execute on function public.tm_save_task(uuid, text, text, text, date, uuid) to authenticated;
grant execute on function public.tm_delete_task(uuid) to authenticated;
grant execute on function public.tm_act(uuid, text, text) to authenticated;

-- Quién ve qué: cada persona su propio perfil, sus tareas y el historial de ellas;
-- el administrador, todo.
drop policy if exists tm_profiles_select on public.tm_profiles;
create policy tm_profiles_select on public.tm_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.tm_is_admin()));

drop policy if exists tm_tasks_select on public.tm_tasks;
create policy tm_tasks_select on public.tm_tasks
  for select to authenticated
  using ((select private.tm_is_admin()) or assignee_id = (select private.tm_my_id()));

drop policy if exists tm_events_select on public.tm_events;
create policy tm_events_select on public.tm_events
  for select to authenticated
  using (
    (select private.tm_is_admin())
    or exists (
      select 1 from public.tm_tasks t
      where t.id = task_id and t.assignee_id = (select private.tm_my_id())
    )
  );

-- ===========================================================================
-- PARTE 3 · Obras y archivos adjuntos
-- ===========================================================================
-- Las tareas se agrupan por obra y pueden llevar fotos o planos, guardados en un
-- almacén privado: solo los ve quien puede ver la tarea.

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

-- ===========================================================================
-- PARTE 4 · Clientes que siguen el avance de su obra
-- ===========================================================================
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

-- ===========================================================================
-- PARTE 5 · Archivar tareas
-- ===========================================================================
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
