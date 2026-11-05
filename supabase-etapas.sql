create table public.sac_etapas (
  id text primary key default ('etapa-' || gen_random_uuid()::text) check (id ~ '^etapa-[a-f0-9-]{36}$'),
  nome text not null check (char_length(nome) between 1 and 60 and nome = btrim(regexp_replace(nome, '\s+', ' ', 'g')) and lower(nome) not in ('em aberto','em andamento','finalizado','total de solicitações')),
  cor text not null default 'stage-azul' check (cor in ('stage-azul','stage-roxo','stage-laranja','nova','andamento','concluida')),
  criada_em timestamptz not null default now()
);
create unique index sac_etapas_nome_unico on public.sac_etapas (lower(nome));
alter table public.sac_etapas enable row level security;
revoke all on public.sac_etapas from public,anon,authenticated;
grant select on public.sac_etapas to authenticated;
grant insert (nome,cor) on public.sac_etapas to authenticated;
create policy "Equipe consulta etapas" on public.sac_etapas for select to authenticated
using (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));
create policy "Equipe cria etapas" on public.sac_etapas for insert to authenticated
with check (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

create or replace function sac_portal_private.acessar(p_token uuid, p_mensagem text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pedido_id text;
  estado text;
  mensagens jsonb;
  nome_etapa text;
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
  select nome into nome_etapa from public.sac_etapas where id = estado;
  return jsonb_build_object('protocolo', upper(right(pedido_id, 10)),
    'status', case when estado in ('nova','andamento','concluida') then estado when nome_etapa is not null then 'andamento' else 'nova' end,
    'etapa', nome_etapa,
    'mensagens', mensagens);
end;
$$;
