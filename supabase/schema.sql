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
