\set ON_ERROR_STOP on

\if :{?app_role}
\else
  \echo 'Missing required psql variable: app_role'
  \quit 3
\endif
\if :{?app_password}
\else
  \echo 'Missing required psql variable: app_password'
  \quit 3
\endif
\if :{?app_database}
\else
  \echo 'Missing required psql variable: app_database'
  \quit 3
\endif

select exists (
  select 1 from pg_roles where rolname = :'app_role'
) as role_exists
\gset

\if :role_exists
  select not rolsuper
    and not rolcreatedb
    and not rolcreaterole
    and not rolreplication
    and rolcanlogin as role_compatible
  from pg_roles
  where rolname = :'app_role'
  \gset
  \if :role_compatible
  \else
    \echo 'Existing application role is incompatible; stopping for review'
    \quit 4
  \endif
\else
  select format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
    :'app_role'
  )
  \gexec
\endif

alter role :"app_role"
  with login password :'app_password'
  nosuperuser nocreatedb nocreaterole noreplication;

select exists (
  select 1 from pg_database where datname = :'app_database'
) as database_exists
\gset

\if :database_exists
  select pg_get_userbyid(datdba) = :'app_role' as database_compatible
  from pg_database
  where datname = :'app_database'
  \gset
  \if :database_compatible
  \else
    \echo 'Existing application database has a different owner; stopping for review'
    \quit 5
  \endif
\else
  select format(
    'CREATE DATABASE %I OWNER %I',
    :'app_database',
    :'app_role'
  )
  \gexec
\endif

revoke all on database :"app_database" from public;
grant connect, temporary on database :"app_database" to :"app_role";
