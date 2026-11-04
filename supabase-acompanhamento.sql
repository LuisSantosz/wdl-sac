create schema if not exists sac_portal_private;
revoke all on schema sac_portal_private from public;
grant usage on schema sac_portal_private to anon, authenticated;

create table public.sac_links (
  solicitacao_id text primary key references public.solicitacoes(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  ativo boolean not null default true
);
create table public.sac_mensagens (
  id bigint generated always as identity primary key,
  solicitacao_id text not null references public.solicitacoes(id) on delete cascade,
  autor text not null check (autor in ('cliente', 'equipe')),
  mensagem text not null check (char_length(btrim(mensagem)) between 1 and 2000),
  criada_em timestamptz not null default now()
);
create index sac_mensagens_solicitacao_ordem on public.sac_mensagens (solicitacao_id, id desc);
create index sac_mensagens_cliente_limite on public.sac_mensagens (solicitacao_id, criada_em desc) where autor = 'cliente';

alter table public.sac_links enable row level security;
alter table public.sac_mensagens enable row level security;
revoke all on public.sac_links, public.sac_mensagens from public, anon, authenticated;
grant select, insert, update on public.sac_links to authenticated;
grant select on public.sac_mensagens to authenticated;
grant insert (solicitacao_id, autor, mensagem) on public.sac_mensagens to authenticated;

create policy "Equipe gerencia links" on public.sac_links for all to authenticated
using (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())))
with check (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));
create policy "Equipe lê mensagens" on public.sac_mensagens for select to authenticated
using (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));
create policy "Equipe responde mensagens" on public.sac_mensagens for insert to authenticated
with check (autor = 'equipe' and exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

create function sac_portal_private.acessar(p_token uuid, p_mensagem text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pedido_id text;
  estado text;
  mensagens jsonb;
begin
  -- Serializa comentários e revogações do mesmo link.
  select l.solicitacao_id, s.data->>'status' into pedido_id, estado
  from public.sac_links l join public.solicitacoes s on s.id = l.solicitacao_id
  where l.token = p_token and l.ativo
  for update of l;
  if not found then
    return null;
  end if;

  if p_mensagem is not null then
    if char_length(p_mensagem) > 2000 or btrim(p_mensagem, E' \t\r\n') = '' then
      raise exception 'Comentário inválido' using errcode = '22023';
    end if;
    if (select count(*) from public.sac_mensagens
      where solicitacao_id = pedido_id and autor = 'cliente'
        and criada_em > statement_timestamp() - interval '1 minute') >= 5 then
      raise exception 'Limite de comentários atingido' using errcode = 'P0001';
    end if;
    insert into public.sac_mensagens (solicitacao_id, autor, mensagem)
    values (pedido_id, 'cliente', btrim(p_mensagem, E' \t\r\n'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'autor', m.autor, 'mensagem', m.mensagem, 'criada_em', m.criada_em
  ) order by m.id), '[]'::jsonb) into mensagens
  from (select id, autor, mensagem, criada_em from public.sac_mensagens
    where solicitacao_id = pedido_id order by id desc limit 100) m;
  return jsonb_build_object('protocolo', upper(right(pedido_id, 10)),
    'status', case when estado in ('nova','andamento','concluida') then estado else 'nova' end,
    'mensagens', mensagens);
end;
$$;
revoke all on function sac_portal_private.acessar(uuid, text) from public;
grant execute on function sac_portal_private.acessar(uuid, text) to anon, authenticated;

create function public.sac_acompanhamento(p_token uuid, p_mensagem text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select sac_portal_private.acessar(p_token, p_mensagem);
$$;
revoke all on function public.sac_acompanhamento(uuid, text) from public;
grant execute on function public.sac_acompanhamento(uuid, text) to anon, authenticated;
