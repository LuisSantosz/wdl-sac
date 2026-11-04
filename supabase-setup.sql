begin;

create table public.equipe_sac (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.solicitacoes (
  id text primary key,
  revision uuid not null,
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
alter table public.equipe_sac enable row level security;
alter table public.solicitacoes enable row level security;
revoke all on public.equipe_sac, public.solicitacoes from anon, authenticated;
grant select on public.equipe_sac to authenticated;
grant select, insert, update, delete on public.solicitacoes to authenticated;

create policy "Equipe consulta a própria autorização"
on public.equipe_sac for select to authenticated using (user_id = (select auth.uid()));

create policy "Equipe gerencia solicitações"
on public.solicitacoes for all to authenticated
using (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())))
with check (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('sac-pdfs','sac-pdfs',false,20971520,array['application/pdf']);

create policy "Equipe lê PDFs do SAC"
on storage.objects for select to authenticated
using (bucket_id = 'sac-pdfs' and exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

create policy "Equipe anexa PDFs do SAC"
on storage.objects for insert to authenticated
with check (bucket_id = 'sac-pdfs' and exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

create policy "Equipe remove PDFs do SAC"
on storage.objects for delete to authenticated
using (bucket_id = 'sac-pdfs' and exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

commit;
