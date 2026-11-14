-- Prueba de aislamiento real. Los usuarios y datos de prueba se revierten al final.
-- Ejecutar como postgres con el SQL Editor o con execute_sql del proyecto TRAZO.
begin;
select set_config('trazo.test.a', gen_random_uuid()::text, true);
select set_config('trazo.test.b', gen_random_uuid()::text, true);
select set_config('trazo.test.ca', gen_random_uuid()::text, true);
select set_config('trazo.test.cb', gen_random_uuid()::text, true);
insert into auth.users(id, email, email_confirmed_at)
values (current_setting('trazo.test.a')::uuid, 'trazo-isolation-a@example.invalid', now()),
       (current_setting('trazo.test.b')::uuid, 'trazo-isolation-b@example.invalid', now());

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trazo.test.a'), 'role', 'authenticated', 'email', 'trazo-isolation-a@example.invalid')::text, true);
select public.tm_create_company(current_setting('trazo.test.ca')::uuid, 'Empresa de prueba A', 'Persona A');
select public.tm_create_company(current_setting('trazo.test.ca')::uuid, 'Empresa de prueba A', 'Persona A');
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.ca'))::text, true);
select set_config('trazo.test.pa', public.tm_save_project(null, 'Obra A', '', true)::text, true);
select set_config('trazo.test.ma', public.tm_enter()->>'id', true);
select set_config('trazo.test.ta', public.tm_save_task(null, 'Tarea A de prueba', '', 'media', null, current_setting('trazo.test.ma')::uuid, current_setting('trazo.test.pa')::uuid)::text, true);
do $$ begin
  if jsonb_array_length(public.tm_list_companies()) <> 1 then raise exception 'La creacion idempotente duplico la empresa'; end if;
  if (select number from public.tm_tasks where id = current_setting('trazo.test.ta')::uuid) <> 1 then raise exception 'La numeracion de A debe empezar en 1'; end if;
end $$;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trazo.test.b'), 'role', 'authenticated', 'email', 'trazo-isolation-b@example.invalid')::text, true);
select public.tm_create_company(current_setting('trazo.test.cb')::uuid, 'Empresa de prueba B', 'Persona B');
-- Un encabezado falsificado no concede pertenencia.
do $$ begin
  if public.tm_enter() is not null then raise exception 'B entro en A'; end if;
  if (select count(*) from public.tm_tasks) <> 0 then raise exception 'B leyo tareas de A'; end if;
  if private.tm_can_see_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'B puede abrir archivos de A'; end if;
  begin
    perform public.tm_save_project(null, 'Intento no autorizado', '', true);
    raise exception 'B creo una obra en A' using errcode = 'XX000';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'permiso' then raise; end if;
  end;
end $$;
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.cb'))::text, true);
select set_config('trazo.test.pb', public.tm_save_project(null, 'Obra B', '', true)::text, true);
select set_config('trazo.test.mb', public.tm_enter()->>'id', true);
select set_config('trazo.test.tb', public.tm_save_task(null, 'Tarea B de prueba', '', 'media', null, current_setting('trazo.test.mb')::uuid, current_setting('trazo.test.pb')::uuid)::text, true);
select set_config('trazo.test.invite', public.tm_invite('Persona A invitada', 'trazo-isolation-a@example.invalid', 'empleado')->>'invite_code', true);
do $$ begin
  if (select number from public.tm_tasks where id = current_setting('trazo.test.tb')::uuid) <> 1 then raise exception 'La numeracion de B debe empezar en 1'; end if;
  if jsonb_array_length(public.tm_list_companies()) <> 1 then raise exception 'B ve otra empresa'; end if;
end $$;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trazo.test.a'), 'role', 'authenticated', 'email', 'trazo-isolation-a@example.invalid')::text, true);
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.ca'))::text, true);
do $$ begin
  if (select count(*) from public.tm_tasks) <> 1 then raise exception 'A ve tareas fuera de su empresa'; end if;
  if private.tm_can_see_path(current_setting('trazo.test.tb') || '/foto.jpg') then raise exception 'El administrador A puede abrir archivos de B'; end if;
  if not private.tm_can_see_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'A no puede abrir su archivo'; end if;
  begin
    perform public.tm_act(current_setting('trazo.test.tb')::uuid, 'aceptar', '');
    raise exception 'A actuo sobre una tarea de B' using errcode = 'XX000';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'no_existe' then raise; end if;
  end;
  begin
    perform public.tm_save_task(null, 'Cruzar obra B', '', 'media', null, null, current_setting('trazo.test.pb')::uuid);
    raise exception 'A vinculo una obra de B' using errcode = 'XX000';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'obra' then raise; end if;
  end;
  begin
    update public.tm_profiles set role = 'admin';
    raise exception 'Se permiten escrituras directas' using errcode = 'XX000';
  exception when insufficient_privilege then null;
  end;
end $$;

-- La cuenta de A puede aceptar una invitacion de B y mantener ambos roles.
select public.tm_activate(current_setting('trazo.test.invite'));
do $$ begin
  if jsonb_array_length(public.tm_list_companies()) <> 2 then raise exception 'La segunda membresia no se creo'; end if;
end $$;
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.cb'))::text, true);
do $$ begin
  if public.tm_enter()->>'role' <> 'empleado' then raise exception 'El rol se mezclo entre empresas'; end if;
  if (select count(*) from public.tm_tasks) <> 0 then raise exception 'El empleado ve tareas ajenas de B'; end if;
  begin
    perform public.tm_save_project(null, 'Escalada de rol', '', true);
    raise exception 'El administrador A conserva permisos de administrador en B' using errcode = 'XX000';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'permiso' then raise; end if;
  end;
end $$;
-- B es administrador en B y cliente en A. Solo recibe el resumen publicado.
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.ca'))::text, true);
select set_config('trazo.test.client_invite', public.tm_invite_client(current_setting('trazo.test.pa')::uuid, 'Cliente B', 'trazo-isolation-b@example.invalid')->>'invite_code', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trazo.test.b'), 'role', 'authenticated', 'email', 'trazo-isolation-b@example.invalid')::text, true);
select public.tm_activate(current_setting('trazo.test.client_invite'));
do $$
declare v_view jsonb := public.tm_client_view();
begin
  if public.tm_enter()->>'role' <> 'cliente' then raise exception 'El cliente conserva el rol de otra empresa'; end if;
  if jsonb_array_length(v_view) <> 1 then raise exception 'El cliente no recibe su obra'; end if;
  if jsonb_array_length(v_view->0->'tasks') <> 1 then raise exception 'El cliente no recibe su tarea resumida'; end if;
  if (v_view->0->'tasks'->0) ?| array['description','assignee_id','created_by'] then raise exception 'La vista del cliente revela datos internos'; end if;
  if (select count(*) from public.tm_tasks) <> 0 then raise exception 'El cliente puede leer tareas internas'; end if;
  if not private.tm_client_can_see_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'El cliente no puede ver las fotos de su obra'; end if;
  if private.tm_client_can_see_path(current_setting('trazo.test.tb') || '/foto.jpg') then raise exception 'El cliente puede abrir archivos de otra empresa'; end if;
  if private.tm_can_write_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'El cliente puede subir archivos'; end if;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trazo.test.a'), 'role', 'authenticated', 'email', 'trazo-isolation-a@example.invalid')::text, true);
-- El borrado conserva permiso de limpiar solo archivos de esa empresa.
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.ca'))::text, true);
select public.tm_archive_task(current_setting('trazo.test.ta')::uuid, true);
select public.tm_delete_task(current_setting('trazo.test.ta')::uuid);
do $$ begin
  if not private.tm_can_clean_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'El administrador no puede limpiar sus fotos borradas'; end if;
  if private.tm_can_write_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'Se pueden subir fotos a una tarea borrada'; end if;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('trazo.test.b'), 'role', 'authenticated', 'email', 'trazo-isolation-b@example.invalid')::text, true);
select set_config('request.headers', jsonb_build_object('x-trazo-company', current_setting('trazo.test.cb'))::text, true);
do $$ begin
  if private.tm_can_clean_path(current_setting('trazo.test.ta') || '/foto.jpg') then raise exception 'B puede limpiar archivos borrados de A'; end if;
end $$;
select set_config('request.headers', '{}'::text, true);
do $$ begin
  if (select count(*) from public.tm_profiles) <> 0 then raise exception 'Se leen perfiles sin seleccionar empresa'; end if;
end $$;
reset role;
select jsonb_build_object('tenant_isolation', 'passed', 'company_roles', 'passed', 'idempotent_creation', 'passed', 'invitation_membership', 'passed', 'file_permissions', 'passed', 'client_view', 'passed', 'deleted_file_cleanup', 'passed') as test_result;
rollback;
