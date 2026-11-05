-- RLS verificada: SELECT/UPDATE exigem auth.uid() cadastrado em equipe_sac.
-- Nenhuma política RLS é alterada. O único privilégio adicional é a coluna ordem,
-- sob a mesma autorização da equipe já usada para editar nome e cor.
grant update (ordem) on public.sac_etapas to authenticated;

create function public.sac_reordenar_etapas(p_ids text[],p_esperado text[])
returns void language plpgsql security invoker set search_path = '' as $$
declare atuais text[];
begin
  if auth.uid() is null or not exists(select 1 from public.equipe_sac where user_id=auth.uid()) then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(918531221);
  perform id from public.sac_etapas order by id for update;
  select array_agg(id order by ordem,criada_em,id) into atuais from public.sac_etapas;
  if atuais is distinct from p_esperado then raise exception 'Etapas desatualizadas' using errcode='40001'; end if;
  if p_ids is null or cardinality(p_ids)<>cardinality(atuais)
    or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id)
    or exists(select 1 from unnest(p_ids) id where not(id=any(atuais))) then
    raise exception 'Ordem inválida' using errcode='22023';
  end if;
  update public.sac_etapas e set ordem=(s.pos-1)*10
  from unnest(p_ids) with ordinality s(id,pos) where e.id=s.id;
end;
$$;
revoke all on function public.sac_reordenar_etapas(text[],text[]) from public,anon;
grant execute on function public.sac_reordenar_etapas(text[],text[]) to authenticated;
