create function public.sac_importar_crm(p_chamados jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  chamado jsonb;
  novos integer := 0;
  atualizados integer := 0;
  total integer;
  chave text;
  inseridos integer;
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
      'status','nova','vendedor','','nf','','pedido','','data','','endereco','',
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
