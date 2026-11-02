-- Create one confirmed email/password account in the shape Supabase Auth (GoTrue) writes itself.
-- Run only through scripts/accounts/create-user.sh, which supplies two psql variables:
--   email   the account email (argv is fine for it)
--   pw_b64  the account password, base64-encoded and set over stdin, never on a command line
-- Accepted risk: auth.users/auth.identities belong to Supabase Auth and may change on upgrade;
-- `npm run test:user-create-db` signs in through the real Auth API so drift turns CI red.
-- Token columns not listed below default to '' in the current schema; GoTrue fails on NULL tokens.

\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

-- Transaction-local settings carry the inputs into the PL/pgSQL block, which cannot read psql variables.
\o /dev/null
select
  set_config('owner_account.email', lower(trim(:'email')), true),
  set_config('owner_account.password', convert_from(decode(:'pw_b64', 'base64'), 'UTF8'), true);
\o

do $$
declare
  new_email text := current_setting('owner_account.email');
  new_password text := current_setting('owner_account.password');
  new_id uuid := gen_random_uuid();
begin
  if new_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Email must be an email address; nothing changed';
  end if;
  if length(new_password) < 12 then
    raise exception 'Password must be at least 12 characters; nothing changed';
  end if;
  if exists (select 1 from auth.users where lower(email) = new_email) then
    raise exception 'An account with this email already exists; nothing changed';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', new_email,
    extensions.crypt(new_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', new_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );
end
$$;

select current_setting('owner_account.email');

commit;
