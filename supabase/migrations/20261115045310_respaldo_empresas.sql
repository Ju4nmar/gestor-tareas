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
