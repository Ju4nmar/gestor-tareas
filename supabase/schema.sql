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
declare
  v_archived timestamptz;
begin
  -- La tarea se bloquea mientras se comprueba: nadie puede archivarla justo en medio.
  select archived_at into v_archived from public.tm_tasks where id = new.task_id for share;
  if v_archived is not null then
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

-- Quitar un archivo: el administrador o quien lo subió, y nunca de una tarea archivada
-- (una tarea archivada no se modifica). Devuelve su ruta para borrarlo del almacén.
create or replace function private.tm_remove_file(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.tm_my_id();
  v_f public.tm_files;
  v_archived timestamptz;
begin
  select * into v_f from public.tm_files where id = p_id;
  if not found then
    raise exception 'no_existe';
  end if;
  if v_me is null or not (private.tm_is_admin() or v_f.uploaded_by = v_me) then
    raise exception 'permiso';
  end if;
  -- La tarea se bloquea mientras se quita el archivo: nadie puede archivarla justo en medio.
  select archived_at into v_archived from public.tm_tasks where id = v_f.task_id for share;
  if v_archived is not null then
    raise exception 'archivada';
  end if;
  delete from public.tm_files where id = p_id;
  return v_f.path;
end;
$$;

-- Borrar del todo: solo una tarea archivada (se lleva su historial y sus archivos).
-- Devuelve las rutas de sus fotos para que la aplicación las quite del almacén DESPUÉS
-- de que esto haya salido bien: así nunca se pierden fotos de una tarea que sigue ahí.
-- La fila se bloquea mientras se decide, para que nadie pueda restaurarla justo en medio.
-- Cambia lo que devuelve (antes nada), por eso se vuelve a crear en vez de reemplazarla.
drop function if exists public.tm_delete_task(uuid);
drop function if exists private.tm_delete_task(uuid);

create function private.tm_delete_task(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_archived timestamptz;
  v_paths text[];
begin
  select archived_at into v_archived from public.tm_tasks where id = p_id for update;
  if not found then
    raise exception 'no_existe';
  end if;
  if v_archived is null then
    raise exception 'no_archivada';
  end if;
  select coalesce(array_agg(path), '{}'::text[]) into v_paths from public.tm_files where task_id = p_id;
  delete from public.tm_tasks where id = p_id and archived_at is not null;
  return v_paths;
end;
$$;

create function public.tm_delete_task(p_id uuid)
returns text[] language sql security invoker set search_path = ''
as $$ select private.tm_delete_task(p_id); $$;

revoke execute on function private.tm_delete_task(uuid) from public, anon;
revoke execute on function public.tm_delete_task(uuid) from public, anon;
grant execute on function private.tm_delete_task(uuid) to authenticated;
grant execute on function public.tm_delete_task(uuid) to authenticated;

create or replace function public.tm_archive_task(p_id uuid, p_archive boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.tm_archive_task(p_id, p_archive); $$;

revoke execute on function private.tm_freeze_archived() from public, anon, authenticated;
revoke execute on function private.tm_block_archived_files() from public, anon, authenticated;
revoke execute on function private.tm_archive_task(uuid, boolean) from public, anon;
revoke execute on function public.tm_archive_task(uuid, boolean) from public, anon;

grant execute on function private.tm_archive_task(uuid, boolean) to authenticated;
grant execute on function public.tm_archive_task(uuid, boolean) to authenticated;

-- ===========================================================================
-- PARTE 6 · Invitaciones que caducan
-- ===========================================================================
-- Invitaciones que caducan: un código sin usar vale siete días. Pasado ese plazo ya no
-- sirve para activar la cuenta ni para ver a quién pertenece la invitación, y el
-- administrador puede renovarlo (código nuevo, mismo perfil y mismas obras).
-- Una cuenta ya activada nunca caduca.

alter table public.tm_profiles add column if not exists invite_expires_at timestamptz;

-- Las invitaciones pendientes que ya existen valen siete días desde que se ejecuta esto.
update public.tm_profiles
  set invite_expires_at = now() + interval '7 days'
  where user_id is null and invite_code is not null and invite_expires_at is null;

-- Cuánto dura una invitación nueva. Cambiar este valor cambia la duración de las siguientes.
create or replace function private.tm_invite_ttl()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '7 days'; $$;

revoke execute on function private.tm_invite_ttl() from public, anon;

-- A quién pertenece una invitación pendiente (para saludar en la página de activación).
-- Si venció, solo se avisa de eso: no se devuelve el nombre ni el correo.
create or replace function private.tm_invite_info(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when invite_expires_at > now() then jsonb_build_object('name', name, 'email', email)
    else jsonb_build_object('expired', true)
  end
  from public.tm_profiles
  where invite_code = upper(trim(p_code)) and user_id is null and active;
$$;

-- Une la cuenta recién creada con su invitación. Exige el código, el mismo correo y que
-- no haya vencido. Solo a quien es dueño del correo se le dice que venció.
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
    set user_id = v_uid, activated_at = now(), invite_code = null, invite_expires_at = null
    where invite_code = upper(trim(p_code)) and user_id is null and active and email = v_email
      and invite_expires_at > now()
    returning * into v_p;
  if not found then
    if exists (
      select 1 from public.tm_profiles
      where invite_code = upper(trim(p_code)) and user_id is null and active and email = v_email
    ) then
      raise exception 'invitacion_vencida';
    end if;
    raise exception 'invitacion';
  end if;
  return to_jsonb(v_p) - 'invite_code';
end;
$$;

-- Invita a alguien del equipo.
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
  insert into public.tm_profiles (email, name, role, invite_code, invite_expires_at)
    values (v_email, trim(p_name), p_role, private.tm_code(), now() + private.tm_invite_ttl())
    returning * into v_p;
  return to_jsonb(v_p);
end;
$$;

-- Invita a un cliente a una obra y devuelve su perfil. Si ese correo ya es de un
-- cliente, solo lo une a la obra: una misma persona puede seguir varias. Si todavía no
-- activó su cuenta y su código venció, se le da uno nuevo para que el enlace sirva.
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
    if v_p.user_id is null and (v_p.invite_expires_at is null or v_p.invite_expires_at <= now()) then
      update public.tm_profiles
        set invite_code = private.tm_code(), invite_expires_at = now() + private.tm_invite_ttl()
        where id = v_p.id
        returning * into v_p;
    end if;
  else
    if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
      raise exception 'nombre';
    end if;
    insert into public.tm_profiles (email, name, role, invite_code, invite_expires_at)
      values (v_email, trim(p_name), 'cliente', private.tm_code(), now() + private.tm_invite_ttl())
      returning * into v_p;
  end if;
  insert into public.tm_project_clients (project_id, profile_id)
    values (p_project, v_p.id)
    on conflict do nothing;
  return to_jsonb(v_p);
end;
$$;

-- Renueva una invitación que nadie ha activado: código nuevo y otros siete días. Sirve
-- cuando venció o cuando el enlace llegó a quien no debía. Conserva el perfil y sus obras.
create or replace function private.tm_renew_invite(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.tm_require_admin();
  v_p public.tm_profiles;
begin
  select * into v_p from public.tm_profiles where id = p_id for update;
  if not found then
    raise exception 'no_existe';
  end if;
  if v_p.user_id is not null then
    raise exception 'ya_activa';
  end if;
  update public.tm_profiles
    set invite_code = private.tm_code(), invite_expires_at = now() + private.tm_invite_ttl()
    where id = p_id
    returning * into v_p;
  return to_jsonb(v_p);
end;
$$;

create or replace function public.tm_renew_invite(p_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tm_renew_invite(p_id); $$;

revoke execute on function private.tm_renew_invite(uuid) from public, anon;
revoke execute on function public.tm_renew_invite(uuid) from public, anon;

grant execute on function private.tm_renew_invite(uuid) to authenticated;
grant execute on function public.tm_renew_invite(uuid) to authenticated;


-- PARTE 7: empresas y registro
-- Empresas y registro. Se instala sobre schema.sql en el proyecto TRAZO.
-- Cada fila de tm_profiles representa una membresia con un rol por empresa.
-- El encabezado selecciona el contexto. La pertenencia se comprueba en Postgres.

create or replace function private.tm_company_id()
returns uuid language plpgsql stable set search_path = ''
as $$
declare v_value text;
begin
  v_value := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-trazo-company';
  return nullif(v_value, '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
revoke all on function private.tm_company_id() from public, anon;
grant execute on function private.tm_company_id() to authenticated;

-- Esta transicion exige una instalacion limpia o una que ya sea multiempresa.
do $$
begin
  if to_regclass('public.tm_companies') is null
     and exists (select 1 from public.tm_profiles) then
    raise exception 'La instalacion contiene perfiles. Requiere una migracion de datos revisada.';
  end if;
end;
$$;

create table if not exists public.tm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.tm_companies enable row level security;
create index if not exists tm_companies_creator_idx on public.tm_companies(created_by);

do $$
declare v_table text;
begin
  foreach v_table in array array['tm_profiles', 'tm_projects', 'tm_tasks', 'tm_events', 'tm_files', 'tm_project_clients'] loop
    execute format('alter table public.%I add column if not exists company_id uuid not null default private.tm_company_id() references public.tm_companies(id)', v_table);
    execute format('create index if not exists %I on public.%I(company_id)', v_table || '_company_idx', v_table);
  end loop;
end;
$$;

alter table public.tm_profiles drop constraint if exists tm_profiles_user_id_key;
alter table public.tm_profiles drop constraint if exists tm_profiles_email_key;
alter table public.tm_tasks drop constraint if exists tm_tasks_number_key;

-- Claves compuestas impiden enlazar responsables, clientes o tareas de otra empresa.
do $$
declare v_table text;
begin
  foreach v_table in array array['tm_profiles', 'tm_projects', 'tm_tasks'] loop
    if not exists (select 1 from pg_constraint where conname = v_table || '_company_id_id_key' and conrelid = format('public.%I', v_table)::regclass) then
      execute format('alter table public.%I add constraint %I unique(company_id, id)', v_table, v_table || '_company_id_id_key');
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'tm_profiles_company_user_key') then
    alter table public.tm_profiles add constraint tm_profiles_company_user_key unique(company_id, user_id);
    alter table public.tm_profiles add constraint tm_profiles_company_email_key unique(company_id, email);
    alter table public.tm_tasks add constraint tm_tasks_company_number_key unique(company_id, number);
    alter table public.tm_tasks add constraint tm_tasks_company_assignee_fk foreign key(company_id, assignee_id) references public.tm_profiles(company_id, id) on delete set null (assignee_id);
    alter table public.tm_tasks add constraint tm_tasks_company_creator_fk foreign key(company_id, created_by) references public.tm_profiles(company_id, id) on delete set null (created_by);
    alter table public.tm_tasks add constraint tm_tasks_company_project_fk foreign key(company_id, project_id) references public.tm_projects(company_id, id) on delete set null (project_id);
    alter table public.tm_events add constraint tm_events_company_task_fk foreign key(company_id, task_id) references public.tm_tasks(company_id, id) on delete cascade;
    alter table public.tm_events add constraint tm_events_company_actor_fk foreign key(company_id, actor_id) references public.tm_profiles(company_id, id) on delete set null (actor_id);
    alter table public.tm_files add constraint tm_files_company_task_fk foreign key(company_id, task_id) references public.tm_tasks(company_id, id) on delete cascade;
    alter table public.tm_files add constraint tm_files_company_uploader_fk foreign key(company_id, uploaded_by) references public.tm_profiles(company_id, id) on delete set null (uploaded_by);
    alter table public.tm_project_clients add constraint tm_project_clients_company_project_fk foreign key(company_id, project_id) references public.tm_projects(company_id, id) on delete cascade;
    alter table public.tm_project_clients add constraint tm_project_clients_company_profile_fk foreign key(company_id, profile_id) references public.tm_profiles(company_id, id) on delete cascade;
  end if;
end;
$$;

-- Los helpers de pertenencia tienen una consulta acotada al usuario autenticado.
-- Su propietario conserva acceso a perfiles para evitar recursion en las politicas.
create or replace function private.tm_has_company(p_company uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.tm_profiles where company_id = p_company and user_id = (select auth.uid()) and active);
$$;
create or replace function private.tm_my_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select id from public.tm_profiles where company_id = private.tm_company_id() and user_id = (select auth.uid()) and active;
$$;
create or replace function private.tm_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.tm_profiles where company_id = private.tm_company_id() and user_id = (select auth.uid()) and active and role = 'admin');
$$;
create or replace function private.tm_require_admin()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.tm_profiles where company_id = private.tm_company_id() and user_id = (select auth.uid()) and active and role = 'admin';
  if v_id is null then raise exception 'permiso'; end if;
  return v_id;
end;
$$;

-- La primera cuenta deja de recibir permisos globales automaticamente.
revoke all on function public.claim_admin(), private.claim_admin(), public.is_admin() from public, anon, authenticated;
revoke all on table public.admins from anon, authenticated;

create or replace function private.tm_enter()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select to_jsonb(p) - 'invite_code' from public.tm_profiles p
  where p.company_id = private.tm_company_id() and p.user_id = (select auth.uid()) and p.active;
$$;

-- Una solicitud UUID puede reintentarse sin duplicar la empresa.
create or replace function public.tm_create_company(p_id uuid, p_name text, p_person_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_company public.tm_companies;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sesion'; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'confirmar'; end if;
  if p_id is null or char_length(trim(coalesce(p_name, ''))) not between 2 and 80
     or char_length(trim(coalesce(p_person_name, ''))) not between 2 and 80 then raise exception 'nombre'; end if;
  insert into public.tm_companies(id, name, created_by) values(p_id, trim(p_name), v_uid) on conflict(id) do nothing;
  select * into v_company from public.tm_companies where id = p_id and created_by = v_uid for update;
  if not found then raise exception 'permiso'; end if;
  insert into public.tm_profiles(company_id, user_id, email, name, role, active, activated_at)
  values(p_id, v_uid, v_email, trim(p_person_name), 'admin', true, now())
  on conflict(company_id, user_id) do nothing;
  return to_jsonb(v_company);
end;
$$;
revoke all on function public.tm_create_company(uuid, text, text) from public, anon;
grant execute on function public.tm_create_company(uuid, text, text) to authenticated;

create or replace function public.tm_list_companies()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'profile_id', p.id, 'role', p.role) order by c.created_at), '[]'::jsonb)
  from public.tm_companies c join public.tm_profiles p on p.company_id = c.id
  where p.user_id = (select auth.uid()) and p.active;
$$;
-- Esta funcion necesita listar las membresias de varias empresas sin el contexto activo.
-- Se acota explicitamente a auth.uid() y solo devuelve nombres y el rol propio.
alter function public.tm_list_companies() security definer;
revoke all on function public.tm_list_companies() from public, anon;
grant execute on function public.tm_list_companies() to authenticated;

create or replace function private.tm_code()
returns text language sql volatile set search_path = ''
as $$ select upper(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')); $$;

create or replace function private.tm_invite_info(p_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when p.invite_expires_at > now()
    then jsonb_build_object('name', p.name, 'email', p.email, 'company', c.name)
    else jsonb_build_object('expired', true) end
  from public.tm_profiles p join public.tm_companies c on c.id = p.company_id
  where p.invite_code = upper(trim(p_code)) and p.user_id is null and p.active;
$$;

-- La invitacion identifica la empresa antes de que el usuario pueda seleccionarla.
create or replace function private.tm_activate(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_profile public.tm_profiles;
begin
  if v_uid is null then raise exception 'sesion'; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'confirmar'; end if;
  select * into v_profile from public.tm_profiles
  where invite_code = upper(trim(p_code)) and user_id is null and active and email = v_email for update;
  if not found then raise exception 'invitacion'; end if;
  if v_profile.invite_expires_at is null or v_profile.invite_expires_at <= now() then raise exception 'invitacion_vencida'; end if;
  if exists (select 1 from public.tm_profiles where company_id = v_profile.company_id and user_id = v_uid) then raise exception 'ya_activa'; end if;
  update public.tm_profiles set user_id = v_uid, activated_at = now(), invite_code = null, invite_expires_at = null
  where id = v_profile.id returning * into v_profile;
  return to_jsonb(v_profile) - 'invite_code';
end;
$$;

-- Las funciones de negocio conservan las reglas existentes y se ejecutan con un
-- rol interno sin BYPASSRLS y sin acceso de login. Asi RLS tambien las acota.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'trazo_api') then
    create role trazo_api nologin inherit nobypassrls;
  end if;
  if exists (select 1 from pg_roles where rolname = 'trazo_api' and (rolsuper or rolbypassrls or rolcanlogin)) then
    raise exception 'El rol trazo_api debe tener NOLOGIN y NOBYPASSRLS';
  end if;
end;
$$;
grant authenticated to trazo_api;
grant trazo_api to postgres;
grant usage on schema public, private, auth to trazo_api;
grant create on schema private to trazo_api;
grant execute on function auth.uid(), auth.jwt() to trazo_api;
grant select on public.tm_companies to trazo_api;

drop policy if exists tm_companies_select on public.tm_companies;
create policy tm_companies_select on public.tm_companies for select to authenticated
using (private.tm_has_company(id));
revoke all on public.tm_companies from anon, authenticated;
grant select on public.tm_companies to authenticated;
revoke all on function private.tm_has_company(uuid) from public, anon;
grant execute on function private.tm_has_company(uuid) to authenticated, trazo_api;

-- Politicas restrictivas se combinan con las reglas de rol ya existentes.
do $$
declare v_table text;
begin
  foreach v_table in array array['tm_profiles', 'tm_projects', 'tm_tasks', 'tm_events', 'tm_files', 'tm_project_clients'] loop
    execute format('drop policy if exists tm_company_scope on public.%I', v_table);
    execute format('create policy tm_company_scope on public.%I as restrictive for all to authenticated using (company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id()))) with check (company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id())))', v_table);
    execute format('drop policy if exists tm_internal_scope on public.%I', v_table);
    execute format('create policy tm_internal_scope on public.%I for all to trazo_api using (company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id()))) with check (company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id())))', v_table);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on public.%I to trazo_api', v_table);
  end loop;
end;
$$;
grant usage, select on sequence public.tm_events_id_seq, public.tm_task_number to trazo_api;

-- Numeracion atomica por empresa.
create table if not exists private.tm_company_counters (
  company_id uuid primary key references public.tm_companies(id) on delete cascade,
  next_number integer not null check(next_number > 0)
);
alter table private.tm_company_counters enable row level security;
revoke all on private.tm_company_counters from public, anon, authenticated;
grant select, insert, update on private.tm_company_counters to trazo_api;
drop policy if exists tm_counters_scope on private.tm_company_counters;
create policy tm_counters_scope on private.tm_company_counters for all to trazo_api
using (company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id())))
with check (company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id())));
create or replace function private.tm_number_task()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.tm_company_counters(company_id, next_number) values(new.company_id, 1)
  on conflict(company_id) do update set next_number = private.tm_company_counters.next_number + 1
  returning next_number into new.number;
  return new;
end;
$$;
alter table public.tm_tasks alter column number drop default;
drop trigger if exists tm_number_task on public.tm_tasks;
create trigger tm_number_task before insert on public.tm_tasks for each row execute function private.tm_number_task();

-- Incluso un administrador debe pertenecer a la empresa de la tarea solicitada.
create or replace function private.tm_can_see_task(p_task uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.tm_tasks where id = p_task
    and (private.tm_is_admin() or (assignee_id = private.tm_my_id() and archived_at is null)));
$$;
create or replace function private.tm_can_write_path(p_path text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (select 1 from public.tm_tasks where id = split_part(p_path, '/', 1)::uuid
    and archived_at is null and private.tm_can_see_task(id));
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function private.tm_can_write_path(text) from public, anon;
grant execute on function private.tm_can_write_path(text) to authenticated;
drop policy if exists tareas_insert on storage.objects;
create policy tareas_insert on storage.objects for insert to authenticated
with check (bucket_id = 'tareas' and private.tm_can_write_path(name));
drop policy if exists tareas_delete on storage.objects;
create policy tareas_delete on storage.objects for delete to authenticated
using (bucket_id = 'tareas' and private.tm_can_write_path(name) and (private.tm_is_admin() or owner_id = (select auth.uid())::text));

-- Los helpers acotados anteriores conservan su propietario de instalacion.
-- Las demas funciones del flujo quedan sometidas a RLS al ejecutarse.
do $$
declare v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'tm\_%' escape '\'
      and p.proname not in ('tm_company_id', 'tm_has_company', 'tm_my_id', 'tm_is_admin', 'tm_require_admin', 'tm_invite_info', 'tm_activate')
  loop
    execute format('alter function %s owner to trazo_api', v_function.signature);
  end loop;
end;
$$;

revoke create on schema private from trazo_api;
revoke all on function private.tm_number_task() from public, anon, authenticated;

-- Solo los wrappers publicados forman la API. PostgREST vuelve a cargar firmas.
notify pgrst, 'reload schema';

-- PARTE 8: indices y permisos de limpieza
-- Mantiene el permiso de limpieza despues de borrar una tarea archivada.
-- Se conserva solo su identificador y empresa para autorizar los reintentos.
create table if not exists private.tm_deleted_tasks (
  id uuid primary key,
  company_id uuid not null references public.tm_companies(id)
);
alter table private.tm_deleted_tasks enable row level security;
create index if not exists tm_deleted_tasks_company_idx on private.tm_deleted_tasks(company_id);
create policy tm_deleted_tasks_internal on private.tm_deleted_tasks for all to trazo_api
using (company_id = private.tm_company_id() and private.tm_has_company(company_id))
with check (company_id = private.tm_company_id() and private.tm_has_company(company_id));
grant select, insert on private.tm_deleted_tasks to trazo_api;

create or replace function private.tm_remember_deleted_task()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.tm_deleted_tasks(id, company_id) values(old.id, old.company_id) on conflict(id) do nothing;
  return old;
end;
$$;
grant create on schema private to trazo_api;
alter function private.tm_remember_deleted_task() owner to trazo_api;
revoke all on function private.tm_remember_deleted_task() from public, anon, authenticated;
drop trigger if exists tm_remember_deleted_task on public.tm_tasks;
create trigger tm_remember_deleted_task before delete on public.tm_tasks
for each row execute function private.tm_remember_deleted_task();

create or replace function private.tm_can_clean_path(p_path text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  return private.tm_is_admin() and exists (
    select 1 from private.tm_deleted_tasks where id = split_part(p_path, '/', 1)::uuid
  );
exception when invalid_text_representation then return false;
end;
$$;
alter function private.tm_can_clean_path(text) owner to trazo_api;
revoke create on schema private from trazo_api;
revoke all on function private.tm_can_clean_path(text) from public, anon;
grant execute on function private.tm_can_clean_path(text) to authenticated;

drop policy if exists tareas_select on storage.objects;
create policy tareas_select on storage.objects for select to authenticated
using (bucket_id = 'tareas' and (private.tm_can_see_path(name) or private.tm_client_can_see_path(name) or private.tm_can_clean_path(name)));
drop policy if exists tareas_delete on storage.objects;
create policy tareas_delete on storage.objects for delete to authenticated
using (bucket_id = 'tareas' and (private.tm_can_clean_path(name) or
  (private.tm_can_write_path(name) and (private.tm_is_admin() or owner_id = (select auth.uid())::text))));

-- Indices para las nuevas relaciones compuestas y la identidad de la cuenta.
create index if not exists tm_profiles_user_idx on public.tm_profiles(user_id);
create index if not exists tm_tasks_company_assignee_idx on public.tm_tasks(company_id, assignee_id);
create index if not exists tm_tasks_company_creator_idx on public.tm_tasks(company_id, created_by);
create index if not exists tm_tasks_company_project_idx on public.tm_tasks(company_id, project_id);
create index if not exists tm_tasks_creator_idx on public.tm_tasks(created_by);
create index if not exists tm_events_company_task_idx on public.tm_events(company_id, task_id);
create index if not exists tm_events_company_actor_idx on public.tm_events(company_id, actor_id);
create index if not exists tm_events_actor_idx on public.tm_events(actor_id);
create index if not exists tm_files_company_task_idx on public.tm_files(company_id, task_id);
create index if not exists tm_files_company_uploader_idx on public.tm_files(company_id, uploaded_by);
create index if not exists tm_files_uploader_idx on public.tm_files(uploaded_by);
create index if not exists tm_project_clients_company_project_idx on public.tm_project_clients(company_id, project_id);
create index if not exists tm_project_clients_company_profile_idx on public.tm_project_clients(company_id, profile_id);
notify pgrst, 'reload schema';

-- PARTE 9: mejoras operativas
-- Mejoras compatibles con los datos y llamadas anteriores.
alter table public.tm_tasks add column if not exists weight integer not null default 1 check(weight between 1 and 1000);
alter table public.tm_tasks add column if not exists request_id uuid;
create unique index if not exists tm_tasks_request_idx on public.tm_tasks(company_id, request_id) where request_id is not null;
create index if not exists tm_tasks_search_idx on public.tm_tasks using gin(to_tsvector('spanish', title || ' ' || description));
alter table public.tm_companies add column if not exists contact text not null default '' check(char_length(contact) <= 200);
alter table public.tm_companies add column if not exists phone text not null default '' check(char_length(phone) <= 50);
alter table public.tm_companies add column if not exists logo_path text;

create table if not exists public.tm_templates (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null default private.tm_company_id() references public.tm_companies(id),
 name text not null check(char_length(trim(name)) between 2 and 80),
 title text not null check(char_length(trim(title)) between 3 and 140),
 description text not null default '' check(char_length(description) <= 5000),
 priority text not null default 'media' check(priority in ('baja','media','alta','urgente')),
 weight integer not null default 1 check(weight between 1 and 1000)
);
create index if not exists tm_templates_company_idx on public.tm_templates(company_id);
create table if not exists public.tm_read_markers (
 company_id uuid not null references public.tm_companies(id),
 profile_id uuid not null,
 seen_at timestamptz not null default now(),
 primary key(company_id,profile_id),
 foreign key(company_id,profile_id) references public.tm_profiles(company_id,id) on delete cascade
);
alter table public.tm_templates enable row level security;
alter table public.tm_read_markers enable row level security;
revoke all on public.tm_templates, public.tm_read_markers from anon, authenticated;
grant select on public.tm_templates, public.tm_read_markers to authenticated;
grant select,insert,update,delete on public.tm_templates, public.tm_read_markers to trazo_api;
create policy tm_templates_read on public.tm_templates for select to authenticated
 using(company_id = (select private.tm_company_id()) and (select private.tm_is_admin()));
create policy tm_markers_read on public.tm_read_markers for select to authenticated
 using(company_id = (select private.tm_company_id()) and profile_id = (select private.tm_my_id()));
create policy tm_templates_internal on public.tm_templates for all to trazo_api
 using(company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id())))
 with check(company_id = (select private.tm_company_id()) and (select private.tm_has_company(private.tm_company_id())));
create policy tm_markers_internal on public.tm_read_markers for all to trazo_api
 using(company_id = (select private.tm_company_id()) and profile_id = (select private.tm_my_id()))
 with check(company_id = (select private.tm_company_id()) and profile_id = (select private.tm_my_id()));

grant create on schema private to trazo_api;
create or replace function private.tm_save_task_v2(p_id uuid,p_request uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.tm_require_admin(); v_id uuid; v_weight int := coalesce((p_data->>'weight')::int,1);
begin
 if v_weight not between 1 and 1000 then raise exception 'peso'; end if;
 if p_id is null then
   if p_request is null then raise exception 'sesion'; end if;
   perform pg_advisory_xact_lock(hashtextextended(private.tm_company_id()::text || p_request::text,0));
   select id into v_id from public.tm_tasks where request_id=p_request;
   if found then return v_id; end if;
 end if;
 v_id := private.tm_save_task(p_id,p_data->>'title',coalesce(p_data->>'description',''),p_data->>'priority',nullif(p_data->>'due_date','')::date,nullif(p_data->>'assignee_id','')::uuid,nullif(p_data->>'project_id','')::uuid);
 update public.tm_tasks set weight=v_weight,request_id=coalesce(request_id,p_request) where id=v_id;
 return v_id;
end $$;
alter function private.tm_save_task_v2(uuid,uuid,jsonb) owner to trazo_api;
create or replace function public.tm_save_task_v2(p_id uuid,p_request uuid,p_data jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.tm_save_task_v2(p_id,p_request,p_data); $$;

create or replace function private.tm_save_template(p_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_admin uuid := private.tm_require_admin(); v_id uuid;
begin
 if p_id is not null then
   delete from public.tm_templates where id=p_id returning id into v_id;
   if not found then raise exception 'no_existe'; end if;
   return v_id;
 end if;
 insert into public.tm_templates(name,title,description,priority,weight)
 values(p_data->>'name',p_data->>'title',coalesce(p_data->>'description',''),p_data->>'priority',coalesce((p_data->>'weight')::int,1)) returning id into v_id;
 return v_id;
end $$;
alter function private.tm_save_template(uuid,jsonb) owner to trazo_api;
create or replace function public.tm_save_template(p_id uuid,p_data jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.tm_save_template(p_id,p_data); $$;

create or replace function private.tm_update_company(p_name text,p_contact text,p_phone text,p_logo text)
returns void language plpgsql security definer set search_path='' as $$
declare v_admin uuid := private.tm_require_admin();
begin
 if char_length(trim(p_name)) not between 2 and 80 then raise exception 'nombre'; end if;
 if p_logo is not null and p_logo <> private.tm_company_id()::text || '/logo.jpg' then raise exception 'archivo'; end if;
 update public.tm_companies set name=trim(p_name),contact=trim(coalesce(p_contact,'')),phone=trim(coalesce(p_phone,'')),logo_path=p_logo where id=private.tm_company_id();
end $$;
grant update on public.tm_companies to trazo_api;
create policy tm_companies_internal_update on public.tm_companies for update to trazo_api
 using(id=(select private.tm_company_id()) and (select private.tm_is_admin()))
 with check(id=(select private.tm_company_id()) and (select private.tm_is_admin()));
alter function private.tm_update_company(text,text,text,text) owner to trazo_api;
create or replace function public.tm_update_company(p_name text,p_contact text,p_phone text,p_logo text)
returns void language sql security invoker set search_path='' as $$ select private.tm_update_company(p_name,p_contact,p_phone,p_logo); $$;

create or replace function private.tm_mark_seen()
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_me uuid:=private.tm_my_id(); v_seen timestamptz;
begin
 if v_me is null then raise exception 'sesion'; end if;
 insert into public.tm_read_markers(company_id,profile_id,seen_at) values(private.tm_company_id(),v_me,clock_timestamp())
 on conflict(company_id,profile_id) do update set seen_at=excluded.seen_at returning seen_at into v_seen;
 return v_seen;
end $$;
alter function private.tm_mark_seen() owner to trazo_api;
create or replace function public.tm_mark_seen()
returns timestamptz language sql security invoker set search_path='' as $$ select private.tm_mark_seen(); $$;

create or replace function public.tm_search_tasks(p_filter jsonb,p_offset int default 0,p_limit int default 30)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as (
 select t.* from public.tm_tasks t
 where archived_at is null
 and (coalesce(p_filter->>'q','')='' or to_tsvector('spanish',title || ' ' || description) @@ plainto_tsquery('spanish',p_filter->>'q') or number::text=ltrim(regexp_replace(upper(p_filter->>'q'),'^T-?',''),'0'))
 and (coalesce(p_filter->>'project','')='' or (p_filter->>'project'='ninguna' and project_id is null) or project_id::text=p_filter->>'project')
 and (coalesce(p_filter->>'assignee','')='' or (p_filter->>'assignee'='nadie' and assignee_id is null) or assignee_id::text=p_filter->>'assignee')
 and (coalesce(p_filter->>'priority','')='' or priority=p_filter->>'priority')
 and (coalesce(p_filter->>'status','')='' or status=p_filter->>'status')
 and (coalesce(p_filter->>'view','todas')='todas' or (p_filter->>'view'='abiertas' and status<>'completada') or (p_filter->>'view'='completadas' and status='completada'))
 and (not coalesce((p_filter->>'overdue')::boolean,false) or (due_date < (now() at time zone 'America/Bogota')::date and status<>'completada'))
 and (coalesce(p_filter->>'from','')='' or due_date >= (p_filter->>'from')::date)
 and (coalesce(p_filter->>'to','')='' or due_date <= (p_filter->>'to')::date)
 ), page as (select * from filtered order by due_date nulls last,number desc limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('empresas','empresas',false,1048576,array['image/jpeg']) on conflict(id) do nothing;
create policy empresas_read on storage.objects for select to authenticated using(bucket_id='empresas' and name=(select private.tm_company_id())::text || '/logo.jpg' and (select private.tm_has_company(private.tm_company_id())));
create policy empresas_insert on storage.objects for insert to authenticated with check(bucket_id='empresas' and name=(select private.tm_company_id())::text || '/logo.jpg' and (select private.tm_is_admin()));
create policy empresas_update on storage.objects for update to authenticated using(bucket_id='empresas' and name=(select private.tm_company_id())::text || '/logo.jpg' and (select private.tm_is_admin())) with check(bucket_id='empresas' and name=(select private.tm_company_id())::text || '/logo.jpg' and (select private.tm_is_admin()));

revoke create on schema private from trazo_api;
revoke all on function private.tm_save_task_v2(uuid,uuid,jsonb), public.tm_save_task_v2(uuid,uuid,jsonb), private.tm_save_template(uuid,jsonb), public.tm_save_template(uuid,jsonb), private.tm_update_company(text,text,text,text), public.tm_update_company(text,text,text,text), private.tm_mark_seen(), public.tm_mark_seen(), public.tm_search_tasks(jsonb,int,int) from public,anon;
grant execute on function private.tm_save_task_v2(uuid,uuid,jsonb), public.tm_save_task_v2(uuid,uuid,jsonb), private.tm_save_template(uuid,jsonb), public.tm_save_template(uuid,jsonb), private.tm_update_company(text,text,text,text), public.tm_update_company(text,text,text,text), private.tm_mark_seen(), public.tm_mark_seen(), public.tm_search_tasks(jsonb,int,int) to authenticated;
notify pgrst,'reload schema';

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
        'completed_at', t.completed_at,
        'weight', t.weight
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

-- PARTE 10: reintentos idempotentes de archivos
grant create on schema private to trazo_api;
create or replace function private.tm_add_file_v2(p_task uuid,p_path text,p_name text,p_mime text,p_size int)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not private.tm_can_write_path(p_path) or p_path not like p_task::text || '/%' then raise exception 'permiso'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_path,0));
 select id into v_id from public.tm_files where path=p_path and task_id=p_task;
 if found then return v_id; end if;
 return private.tm_add_file(p_task,p_path,p_name,p_mime,p_size);
end $$;
alter function private.tm_add_file_v2(uuid,text,text,text,int) owner to trazo_api;
revoke create on schema private from trazo_api;
create or replace function public.tm_add_file_v2(p_task uuid,p_path text,p_name text,p_mime text,p_size int)
returns uuid language sql security invoker set search_path='' as $$ select private.tm_add_file_v2(p_task,p_path,p_name,p_mime,p_size); $$;
revoke all on function private.tm_add_file_v2(uuid,text,text,text,int),public.tm_add_file_v2(uuid,text,text,text,int) from public,anon;
grant execute on function private.tm_add_file_v2(uuid,text,text,text,int),public.tm_add_file_v2(uuid,text,text,text,int) to authenticated;
notify pgrst,'reload schema';

-- PARTE 11: respaldos de empresa y recuperacion independiente
-- Exportacion consistente por empresa. Los secretos de Auth quedan en el servicio de autenticacion.
grant create on schema private to trazo_api;
create or replace function private.tm_export_company()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin uuid:=private.tm_require_admin(); v_company uuid:=private.tm_company_id();
begin
 return jsonb_build_object('version',1,'owner_profile_id',v_admin,'company',(select to_jsonb(c) from public.tm_companies c where id=v_company),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)-'user_id'-'invite_code'-'invite_expires_at') from public.tm_profiles p where company_id=v_company),'[]'),
 'projects',coalesce((select jsonb_agg(to_jsonb(p)) from public.tm_projects p where company_id=v_company),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(p) order by number) from public.tm_tasks p where company_id=v_company),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(p) order by id) from public.tm_events p where company_id=v_company),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(p)) from public.tm_files p where company_id=v_company),'[]'),
 'clients',coalesce((select jsonb_agg(to_jsonb(p)) from public.tm_project_clients p where company_id=v_company),'[]'),
 'templates',coalesce((select jsonb_agg(to_jsonb(p)) from public.tm_templates p where company_id=v_company),'[]'));
end $$;
alter function private.tm_export_company() owner to trazo_api;
revoke create on schema private from trazo_api;
create or replace function public.tm_export_company()
returns jsonb language sql security invoker set search_path='' as $$ select private.tm_export_company(); $$;

create table if not exists private.tm_restore_jobs (
 company_id uuid primary key references public.tm_companies(id),
 created_by uuid not null references auth.users(id),
 digest text not null,
 paths jsonb not null,
 finished boolean not null default false
);
alter table private.tm_restore_jobs enable row level security;
create index if not exists tm_restore_jobs_creator_idx on private.tm_restore_jobs(created_by);
revoke all on private.tm_restore_jobs from public,anon,authenticated,trazo_api;

-- Cada recuperacion crea una empresa independiente y remapea todas sus relaciones.
create or replace function private.tm_restore_company(p_id uuid,p_backup jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_admin uuid; v_row jsonb; v_id uuid; v_owner text:=p_backup->>'owner_profile_id';
 v_profiles jsonb:='{}'; v_projects jsonb:='{}'; v_tasks jsonb:='{}'; v_paths jsonb:='[]';
 v_job private.tm_restore_jobs; v_digest text:=md5(p_backup::text); v_path text;
begin
 if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'sesion'; end if;
 if not exists(select 1 from auth.users where id=v_uid and email_confirmed_at is not null) then raise exception 'confirmar'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into v_job from private.tm_restore_jobs where company_id=p_id;
 if found then
   if v_job.created_by<>v_uid or v_job.digest<>v_digest then raise exception 'permiso'; end if;
   return jsonb_build_object('company_id',p_id,'paths',v_job.paths,'finished',v_job.finished);
 end if;
 if (p_backup->>'version')::int<>1 or octet_length(p_backup::text)>30000000 or jsonb_array_length(p_backup->'tasks')>10000 or jsonb_array_length(p_backup->'profiles')>2000 or jsonb_array_length(p_backup->'files')>10000 then raise exception 'archivo'; end if;
 if exists(select 1 from public.tm_companies where id=p_id) then raise exception 'duplicado'; end if;
 if not exists(select 1 from jsonb_array_elements(p_backup->'profiles') p where p->>'id'=v_owner and p->>'role'='admin') then raise exception 'archivo'; end if;
 perform public.tm_create_company(p_id,left(p_backup->'company'->>'name',65)||' (recuperada)','Administrador');
 perform set_config('request.headers',jsonb_build_object('x-trazo-company',p_id)::text,true);
 select id into v_admin from public.tm_profiles where company_id=p_id and user_id=v_uid;
 v_profiles:=jsonb_build_object(v_owner,v_admin);
 update public.tm_companies set contact=coalesce(p_backup->'company'->>'contact',''),phone=coalesce(p_backup->'company'->>'phone','') where id=p_id;
 for v_row in select value from jsonb_array_elements(p_backup->'profiles') loop
   if v_row->>'id'=v_owner then
     update public.tm_profiles set name=v_row->>'name' where id=v_admin;
   else
     insert into public.tm_profiles(company_id,name,email,role,active,invite_code,invite_expires_at)
     values(p_id,v_row->>'name',v_row->>'email',v_row->>'role',coalesce((v_row->>'active')::boolean,true),private.tm_code(),now()+private.tm_invite_ttl()) returning id into v_id;
     v_profiles:=v_profiles||jsonb_build_object(v_row->>'id',v_id);
   end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'projects') loop
   insert into public.tm_projects(company_id,name,detail,active) values(p_id,v_row->>'name',coalesce(v_row->>'detail',''),(v_row->>'active')::boolean) returning id into v_id;
   v_projects:=v_projects||jsonb_build_object(v_row->>'id',v_id);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'tasks') order by (value->>'number')::int loop
   insert into public.tm_tasks(company_id,title,description,priority,due_date,assignee_id,project_id,status,created_by,created_at,updated_at,completed_at,weight)
   values(p_id,v_row->>'title',coalesce(v_row->>'description',''),v_row->>'priority',nullif(v_row->>'due_date','')::date,(v_profiles->>(v_row->>'assignee_id'))::uuid,(v_projects->>(v_row->>'project_id'))::uuid,v_row->>'status',(v_profiles->>(v_row->>'created_by'))::uuid,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz,(v_row->>'completed_at')::timestamptz,coalesce((v_row->>'weight')::int,1)) returning id into v_id;
   v_tasks:=v_tasks||jsonb_build_object(v_row->>'id',v_id);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'events') loop
   insert into public.tm_events(company_id,task_id,actor_id,actor_name,actor_role,action,from_status,to_status,note,created_at)
   values(p_id,(v_tasks->>(v_row->>'task_id'))::uuid,(v_profiles->>(v_row->>'actor_id'))::uuid,v_row->>'actor_name',v_row->>'actor_role',v_row->>'action',v_row->>'from_status',v_row->>'to_status',coalesce(v_row->>'note',''),(v_row->>'created_at')::timestamptz);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'files') loop
   v_path:=(v_tasks->>(v_row->>'task_id'))||'/'||gen_random_uuid()::text||case when v_row->>'mime'='application/pdf' then '.pdf' else '.jpg' end;
   insert into public.tm_files(company_id,task_id,path,name,mime,size,uploaded_by,uploader_name,created_at)
   values(p_id,(v_tasks->>(v_row->>'task_id'))::uuid,v_path,v_row->>'name',v_row->>'mime',(v_row->>'size')::int,(v_profiles->>(v_row->>'uploaded_by'))::uuid,v_row->>'uploader_name',(v_row->>'created_at')::timestamptz);
   v_paths:=v_paths||jsonb_build_array(jsonb_build_object('bucket','tareas','old_path',v_row->>'path','path',v_path));
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'tasks') loop
   update public.tm_tasks set archived_at=(v_row->>'archived_at')::timestamptz where id=(v_tasks->>(v_row->>'id'))::uuid;
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'clients') loop
   insert into public.tm_project_clients(company_id,project_id,profile_id) values(p_id,(v_projects->>(v_row->>'project_id'))::uuid,(v_profiles->>(v_row->>'profile_id'))::uuid);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'templates') loop
   insert into public.tm_templates(company_id,name,title,description,priority,weight) values(p_id,v_row->>'name',v_row->>'title',v_row->>'description',v_row->>'priority',(v_row->>'weight')::int);
 end loop;
 if p_backup->'company'->>'logo_path' is not null then
   v_paths:=v_paths||jsonb_build_array(jsonb_build_object('bucket','empresas','old_path',p_backup->'company'->>'logo_path','path',p_id::text||'/logo.jpg'));
   update public.tm_companies set logo_path=p_id::text||'/logo.jpg' where id=p_id;
 end if;
 insert into private.tm_restore_jobs(company_id,created_by,digest,paths) values(p_id,v_uid,v_digest,v_paths);
 return jsonb_build_object('company_id',p_id,'paths',v_paths,'finished',false);
end $$;
create or replace function public.tm_restore_company(p_id uuid,p_backup jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.tm_restore_company(p_id,p_backup); $$;

create or replace function private.tm_restore_can_write(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select private.tm_is_admin() and exists(select 1 from private.tm_restore_jobs j cross join lateral jsonb_array_elements(j.paths) p
 where j.company_id=private.tm_company_id() and j.created_by=auth.uid() and not j.finished and p->>'bucket'=p_bucket and p->>'path'=p_path);
$$;
create policy tareas_restore_insert on storage.objects for insert to authenticated with check(private.tm_restore_can_write(bucket_id,name));

create or replace function private.tm_finish_restore(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_job private.tm_restore_jobs;
begin
 select * into v_job from private.tm_restore_jobs where company_id=p_id and created_by=auth.uid() for update;
 if not found then raise exception 'permiso'; end if;
 if exists(select 1 from jsonb_array_elements(v_job.paths) p where not exists(select 1 from storage.objects o where o.bucket_id=p->>'bucket' and o.name=p->>'path')) then raise exception 'archivo'; end if;
 update private.tm_restore_jobs set finished=true where company_id=p_id;
end $$;
create or replace function public.tm_finish_restore(p_id uuid)
returns void language sql security invoker set search_path='' as $$ select private.tm_finish_restore(p_id); $$;
revoke all on function private.tm_export_company(),public.tm_export_company(),private.tm_restore_company(uuid,jsonb),public.tm_restore_company(uuid,jsonb),private.tm_restore_can_write(text,text),private.tm_finish_restore(uuid),public.tm_finish_restore(uuid) from public,anon;
grant execute on function private.tm_export_company(),public.tm_export_company(),private.tm_restore_company(uuid,jsonb),public.tm_restore_company(uuid,jsonb),private.tm_restore_can_write(text,text),private.tm_finish_restore(uuid),public.tm_finish_restore(uuid) to authenticated;
notify pgrst,'reload schema';

-- PARTE 12
-- Busqueda parcial compatible y recuperacion desde otra cuenta del equipo.
create or replace function public.tm_search_tasks(p_filter jsonb,p_offset int default 0,p_limit int default 30)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as (
 select t.* from public.tm_tasks t
 where archived_at is null
 and (coalesce(p_filter->>'q','')='' or to_tsvector('spanish',title || ' ' || description) @@ plainto_tsquery('spanish',p_filter->>'q') or position(translate(lower(p_filter->>'q'),'áéíóúüñ','aeiouun') in translate(lower(title || ' ' || description || ' T-' || lpad(number::text,greatest(3,length(number::text)),'0')),'áéíóúüñ','aeiouun'))>0 or number::text=ltrim(regexp_replace(upper(p_filter->>'q'),'^T-?',''),'0'))
 and (coalesce(p_filter->>'project','')='' or (p_filter->>'project'='ninguna' and project_id is null) or project_id::text=p_filter->>'project')
 and (coalesce(p_filter->>'assignee','')='' or (p_filter->>'assignee'='nadie' and assignee_id is null) or assignee_id::text=p_filter->>'assignee')
 and (coalesce(p_filter->>'priority','')='' or priority=p_filter->>'priority')
 and (coalesce(p_filter->>'status','')='' or status=p_filter->>'status')
 and (coalesce(p_filter->>'view','todas')='todas' or (p_filter->>'view'='abiertas' and status<>'completada') or (p_filter->>'view'='completadas' and status='completada'))
 and (not coalesce((p_filter->>'overdue')::boolean,false) or (due_date < (now() at time zone 'America/Bogota')::date and status<>'completada'))
 and (coalesce(p_filter->>'from','')='' or due_date >= (p_filter->>'from')::date)
 and (coalesce(p_filter->>'to','')='' or due_date <= (p_filter->>'to')::date)
 ), page as (select * from filtered order by due_date nulls last,number desc limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;

create or replace function private.tm_restore_company(p_id uuid,p_backup jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_admin uuid; v_row jsonb; v_id uuid; v_owner text:=p_backup->>'owner_profile_id';
 v_profiles jsonb:='{}'; v_projects jsonb:='{}'; v_tasks jsonb:='{}'; v_paths jsonb:='[]';
 v_job private.tm_restore_jobs; v_digest text:=md5(p_backup::text); v_path text;
begin
 if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'sesion'; end if;
 if not exists(select 1 from auth.users where id=v_uid and email_confirmed_at is not null) then raise exception 'confirmar'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into v_job from private.tm_restore_jobs where company_id=p_id;
 if found then
   if v_job.created_by<>v_uid or v_job.digest<>v_digest then raise exception 'permiso'; end if;
   return jsonb_build_object('company_id',p_id,'paths',v_job.paths,'finished',v_job.finished);
 end if;
 if (p_backup->>'version')::int<>1 or octet_length(p_backup::text)>30000000 or jsonb_array_length(p_backup->'tasks')>10000 or jsonb_array_length(p_backup->'profiles')>2000 or jsonb_array_length(p_backup->'files')>10000 then raise exception 'archivo'; end if;
 if exists(select 1 from public.tm_companies where id=p_id) then raise exception 'duplicado'; end if;
 if not exists(select 1 from jsonb_array_elements(p_backup->'profiles') p where p->>'id'=v_owner and p->>'role'='admin') then raise exception 'archivo'; end if;
 perform public.tm_create_company(p_id,left(p_backup->'company'->>'name',65)||' (recuperada)','Administrador');
 perform set_config('request.headers',jsonb_build_object('x-trazo-company',p_id)::text,true);
 select id into v_admin from public.tm_profiles where company_id=p_id and user_id=v_uid;
 v_profiles:=jsonb_build_object(v_owner,v_admin);
 update public.tm_companies set contact=coalesce(p_backup->'company'->>'contact',''),phone=coalesce(p_backup->'company'->>'phone','') where id=p_id;
 for v_row in select value from jsonb_array_elements(p_backup->'profiles') loop
   if v_row->>'id'=v_owner then
     update public.tm_profiles set name=v_row->>'name' where id=v_admin;
   elsif lower(v_row->>'email')=(select lower(email) from auth.users where id=v_uid) then
     v_profiles:=v_profiles||jsonb_build_object(v_row->>'id',v_admin);
   else
     insert into public.tm_profiles(company_id,name,email,role,active,invite_code,invite_expires_at)
     values(p_id,v_row->>'name',v_row->>'email',v_row->>'role',coalesce((v_row->>'active')::boolean,true),private.tm_code(),now()+private.tm_invite_ttl()) returning id into v_id;
     v_profiles:=v_profiles||jsonb_build_object(v_row->>'id',v_id);
   end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'projects') loop
   insert into public.tm_projects(company_id,name,detail,active) values(p_id,v_row->>'name',coalesce(v_row->>'detail',''),(v_row->>'active')::boolean) returning id into v_id;
   v_projects:=v_projects||jsonb_build_object(v_row->>'id',v_id);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'tasks') order by (value->>'number')::int loop
   insert into public.tm_tasks(company_id,title,description,priority,due_date,assignee_id,project_id,status,created_by,created_at,updated_at,completed_at,weight)
   values(p_id,v_row->>'title',coalesce(v_row->>'description',''),v_row->>'priority',nullif(v_row->>'due_date','')::date,(v_profiles->>(v_row->>'assignee_id'))::uuid,(v_projects->>(v_row->>'project_id'))::uuid,v_row->>'status',(v_profiles->>(v_row->>'created_by'))::uuid,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz,(v_row->>'completed_at')::timestamptz,coalesce((v_row->>'weight')::int,1)) returning id into v_id;
   v_tasks:=v_tasks||jsonb_build_object(v_row->>'id',v_id);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'events') loop
   insert into public.tm_events(company_id,task_id,actor_id,actor_name,actor_role,action,from_status,to_status,note,created_at)
   values(p_id,(v_tasks->>(v_row->>'task_id'))::uuid,(v_profiles->>(v_row->>'actor_id'))::uuid,v_row->>'actor_name',v_row->>'actor_role',v_row->>'action',v_row->>'from_status',v_row->>'to_status',coalesce(v_row->>'note',''),(v_row->>'created_at')::timestamptz);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'files') loop
   v_path:=(v_tasks->>(v_row->>'task_id'))||'/'||gen_random_uuid()::text||case when v_row->>'mime'='application/pdf' then '.pdf' else '.jpg' end;
   insert into public.tm_files(company_id,task_id,path,name,mime,size,uploaded_by,uploader_name,created_at)
   values(p_id,(v_tasks->>(v_row->>'task_id'))::uuid,v_path,v_row->>'name',v_row->>'mime',(v_row->>'size')::int,(v_profiles->>(v_row->>'uploaded_by'))::uuid,v_row->>'uploader_name',(v_row->>'created_at')::timestamptz);
   v_paths:=v_paths||jsonb_build_array(jsonb_build_object('bucket','tareas','old_path',v_row->>'path','path',v_path));
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'tasks') loop
   update public.tm_tasks set archived_at=(v_row->>'archived_at')::timestamptz where id=(v_tasks->>(v_row->>'id'))::uuid;
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'clients') loop
   insert into public.tm_project_clients(company_id,project_id,profile_id) values(p_id,(v_projects->>(v_row->>'project_id'))::uuid,(v_profiles->>(v_row->>'profile_id'))::uuid);
 end loop;
 for v_row in select value from jsonb_array_elements(p_backup->'templates') loop
   insert into public.tm_templates(company_id,name,title,description,priority,weight) values(p_id,v_row->>'name',v_row->>'title',v_row->>'description',v_row->>'priority',(v_row->>'weight')::int);
 end loop;
 if p_backup->'company'->>'logo_path' is not null then
   v_paths:=v_paths||jsonb_build_array(jsonb_build_object('bucket','empresas','old_path',p_backup->'company'->>'logo_path','path',p_id::text||'/logo.jpg'));
   update public.tm_companies set logo_path=p_id::text||'/logo.jpg' where id=p_id;
 end if;
 insert into private.tm_restore_jobs(company_id,created_by,digest,paths) values(p_id,v_uid,v_digest,v_paths);
 return jsonb_build_object('company_id',p_id,'paths',v_paths,'finished',false);
end $$;

notify pgrst,'reload schema';

-- PARTE 13 · Orden de tareas completadas
-- Conservar el orden de las tareas completadas por su fecha de cierre.
-- Busqueda parcial compatible y recuperacion desde otra cuenta del equipo.
create or replace function public.tm_search_tasks(p_filter jsonb,p_offset int default 0,p_limit int default 30)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as (
 select t.* from public.tm_tasks t
 where archived_at is null
 and (coalesce(p_filter->>'q','')='' or to_tsvector('spanish',title || ' ' || description) @@ plainto_tsquery('spanish',p_filter->>'q') or position(translate(lower(p_filter->>'q'),'áéíóúüñ','aeiouun') in translate(lower(title || ' ' || description || ' T-' || lpad(number::text,greatest(3,length(number::text)),'0')),'áéíóúüñ','aeiouun'))>0 or number::text=ltrim(regexp_replace(upper(p_filter->>'q'),'^T-?',''),'0'))
 and (coalesce(p_filter->>'project','')='' or (p_filter->>'project'='ninguna' and project_id is null) or project_id::text=p_filter->>'project')
 and (coalesce(p_filter->>'assignee','')='' or (p_filter->>'assignee'='nadie' and assignee_id is null) or assignee_id::text=p_filter->>'assignee')
 and (coalesce(p_filter->>'priority','')='' or priority=p_filter->>'priority')
 and (coalesce(p_filter->>'status','')='' or status=p_filter->>'status')
 and (coalesce(p_filter->>'view','todas')='todas' or (p_filter->>'view'='abiertas' and status<>'completada') or (p_filter->>'view'='completadas' and status='completada'))
 and (not coalesce((p_filter->>'overdue')::boolean,false) or (due_date < (now() at time zone 'America/Bogota')::date and status<>'completada'))
 and (coalesce(p_filter->>'from','')='' or due_date >= (p_filter->>'from')::date)
 and (coalesce(p_filter->>'to','')='' or due_date <= (p_filter->>'to')::date)
 ), page as (select * from filtered order by case when p_filter->>'view'='completadas' then completed_at end desc nulls last, case when coalesce(p_filter->>'view','')<>'completadas' then due_date end nulls last,number desc limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;

notify pgrst,'reload schema';
