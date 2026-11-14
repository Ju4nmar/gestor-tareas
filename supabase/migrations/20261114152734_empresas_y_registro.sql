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
