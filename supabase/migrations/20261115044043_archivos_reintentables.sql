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
