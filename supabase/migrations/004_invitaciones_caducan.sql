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
