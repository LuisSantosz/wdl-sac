-- Etapas originais passam a compartilhar a mesma configuração das demais.
alter table public.sac_etapas drop constraint sac_etapas_id_check;
alter table public.sac_etapas drop constraint sac_etapas_nome_check;
alter table public.sac_etapas add constraint sac_etapas_id_check check (id in ('nova','andamento','concluida') or id ~ '^etapa-[a-f0-9-]{36}$');
alter table public.sac_etapas add constraint sac_etapas_nome_check check (char_length(nome) between 1 and 60 and nome = btrim(regexp_replace(nome, '\s+', ' ', 'g')));
alter table public.sac_etapas add column ordem integer not null default 100;
insert into public.sac_etapas(id,nome,cor,ordem) values
('nova','Em aberto','nova',0),('andamento','Em andamento','andamento',10),('concluida','Finalizado','concluida',100000);

-- A referência impede que uma edição simultânea deixe chamados sem etapa.
alter table public.solicitacoes add column etapa_id text generated always as (data->>'status') stored not null;
alter table public.solicitacoes add constraint solicitacoes_etapa_fk foreign key (etapa_id) references public.sac_etapas(id);
create index solicitacoes_etapa_idx on public.solicitacoes(etapa_id);

grant update (nome,cor) on public.sac_etapas to authenticated;
grant delete on public.sac_etapas to authenticated;
create policy "Equipe altera etapas" on public.sac_etapas for update to authenticated
using (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())))
with check (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));
create policy "Equipe exclui etapas" on public.sac_etapas for delete to authenticated
using (exists (select 1 from public.equipe_sac where user_id = (select auth.uid())));

create function public.sac_excluir_etapa(p_etapa text,p_destino text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  nome_origem text;
  nome_destino text;
  movidos integer;
begin
  if auth.uid() is null or not exists(select 1 from public.equipe_sac where user_id=auth.uid()) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  -- Serializa exclusões para que duas ações não removam a última etapa.
  perform pg_advisory_xact_lock(918531221);
  if p_etapa is null or p_destino is null or p_etapa=p_destino then raise exception 'Escolha outra etapa de destino'; end if;
  select nome into nome_origem from public.sac_etapas where id=p_etapa for update;
  if not found then raise exception 'Etapa não encontrada'; end if;
  select nome into nome_destino from public.sac_etapas where id=p_destino for key share;
  if not found then raise exception 'Destino não encontrado'; end if;
  update public.solicitacoes set revision=gen_random_uuid(),data=data||jsonb_build_object(
    'status',p_destino,'history',coalesce(data->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'at',floor(extract(epoch from now())*1000),
      'text','Etapa "'||nome_origem||'" excluída. Chamado movido para '||nome_destino||'.'
    ))
  ) where etapa_id=p_etapa;
  get diagnostics movidos=row_count;
  delete from public.sac_etapas where id=p_etapa;
  return movidos;
end;
$$;
revoke all on function public.sac_excluir_etapa(text,text) from public,anon;
grant execute on function public.sac_excluir_etapa(text,text) to authenticated;

create or replace function public.sac_importar_crm(p_chamados jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  chamado jsonb;
  novos integer := 0;
  atualizados integer := 0;
  total integer;
  chave text;
  inseridos integer;
  etapa_inicial text;
begin
  if auth.uid() is null or not exists(select 1 from public.equipe_sac where user_id=auth.uid()) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  if jsonb_typeof(p_chamados) is distinct from 'array' then raise exception 'Lista inválida'; end if;
  total := jsonb_array_length(p_chamados);
  if total < 1 or total > 1000 then raise exception 'Importe de 1 a 1000 chamados'; end if;
  if (select count(distinct value->>'crmCodigo') from jsonb_array_elements(p_chamados)) <> total then
    raise exception 'Códigos duplicados';
  end if;
  select id into etapa_inicial from public.sac_etapas order by (id='nova') desc,ordem,criada_em,id limit 1 for key share;
  if etapa_inicial is null then raise exception 'Crie uma etapa antes de importar'; end if;
  -- Todas as importações do CRM seguem a mesma ordem de bloqueios.
  for chamado in select value from jsonb_array_elements(p_chamados) order by value->>'crmCodigo' loop
    if coalesce(chamado->>'crmCodigo','') !~ '^[0-9]{6,16}$'
      or coalesce(btrim(chamado->>'cliente'),'') = ''
      or length(chamado::text) > 50000
      or coalesce(chamado->>'createdAt','') !~ '^[0-9]{1,15}$' then
      raise exception 'Chamado inválido';
    end if;
    chave := 'star1crm-'||(chamado->>'crmCodigo');
    insert into public.solicitacoes(id,revision,data)
    values(chave,gen_random_uuid(),jsonb_build_object(
      'cliente',chamado->>'cliente','contato',coalesce(chamado->>'contato',''),
      'crmCodigo',chamado->>'crmCodigo','crmStatus',coalesce(chamado->>'crmStatus',''),
      'crmCriacao',coalesce(chamado->>'crmCriacao',''),
      'crmSituacao',coalesce(chamado->>'crmSituacao',''),
      'crmObservacao',coalesce(chamado->>'crmObservacao',''),
      'createdAt',(chamado->>'createdAt')::bigint,
      'status',etapa_inicial,'vendedor','','nf','','pedido','','data','','endereco','',
      'problema',coalesce(nullif(chamado->>'crmSituacao',''),'A classificar'),
      'descricao',coalesce(chamado->>'crmObservacao',''),
      'novaNF','','rastreio','','transportadora','','entrega','',
      'inteira',true,'items','[]'::jsonb,
      'history',jsonb_build_array(jsonb_build_object('at',floor(extract(epoch from now())*1000),'text','Chamado importado do Star1CRM.'))
    )) on conflict(id) do nothing;
    get diagnostics inseridos = row_count;
    if inseridos = 1 then novos := novos + 1;
    else
      update public.solicitacoes
      set revision=gen_random_uuid(),data=data||jsonb_build_object(
        'cliente',chamado->>'cliente','contato',coalesce(chamado->>'contato',''),
        'crmCodigo',chamado->>'crmCodigo','crmStatus',coalesce(chamado->>'crmStatus',''),
        'crmCriacao',coalesce(chamado->>'crmCriacao',''),
        'crmSituacao',coalesce(chamado->>'crmSituacao',''),
        'crmObservacao',coalesce(chamado->>'crmObservacao','')
      )
      where id=chave;
      atualizados := atualizados + 1;
    end if;
  end loop;
  return jsonb_build_object('novos',novos,'atualizados',atualizados);
end;
$$;
revoke all on function public.sac_importar_crm(jsonb) from public,anon;
grant execute on function public.sac_importar_crm(jsonb) to authenticated;
