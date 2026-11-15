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
