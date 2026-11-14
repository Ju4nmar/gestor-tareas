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
