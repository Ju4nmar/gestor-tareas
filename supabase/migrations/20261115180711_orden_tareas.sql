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
