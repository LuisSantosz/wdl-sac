import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

function result({data,error}) {
  if (error) throw error;
  return data;
}

export function connect(config) {
  const client = createClient(config.url,config.publishableKey);
  const table = () => client.from('solicitacoes');
  const bucket = client.storage.from('sac-pdfs');

  async function removeFile(path) {
    if (!path) return;
    const {error} = await bucket.remove([path]);
    if (error) console.warn('Falha ao limpar o anexo do SAC.',error.message);
  }

  return {
    observe(callback) {
      let previousUser;
      client.auth.onAuthStateChange((_event,session) => {
        const user = session?.user ?? null;
        const id = user?.id ?? null;
        if (id === previousUser) return;
        previousUser = id;
        setTimeout(() => callback(user),0);
      });
    },
    login:async (email,password) => result(await client.auth.signInWithPassword({email,password})),
    logout:async () => result(await client.auth.signOut({scope:'local'})),
    async list() {
      const {data:{user},error} = await client.auth.getUser();
      if (error) throw error;
      if (!user || !result(await client.from('equipe_sac').select('user_id').eq('user_id',user.id).maybeSingle())) {
        throw new Error('Conta sem acesso ao SAC.');
      }
      const records = [];
      const pageSize = 200;
      for (let offset = 0; ; offset += pageSize) {
        const rows = result(await table().select('id,revision,data').order('id').range(offset,offset+pageSize-1));
        records.push(...rows.map(row => ({...row.data,id:row.id,revision:row.revision})));
        if (rows.length < pageSize) return records;
      }
    },
    async listStages() {
      return result(await client.from('sac_etapas').select('id,nome,cor,ordem').order('ordem').order('criada_em').order('id'));
    },
    async updateStage(id,stage) {
      return result(await client.from('sac_etapas').update(stage).eq('id',id).select('id').single());
    },
    async deleteStage(id,destination) {
      return result(await client.rpc('sac_excluir_etapa',{p_etapa:id,p_destino:destination}));
    },
    async createStage(stage) {
      return result(await client.from('sac_etapas').insert(stage).select('id').single());
    },
    async importCrm(calls) {
      return result(await client.rpc('sac_importar_crm',{p_chamados:calls}));
    },
    async portal(id) {
      const [link,messages] = await Promise.all([
        client.from('sac_links').select('token,ativo').eq('solicitacao_id',id).maybeSingle(),
        client.from('sac_mensagens').select('autor,mensagem,criada_em').eq('solicitacao_id',id).order('id',{ascending:false}).limit(100)
      ]);
      return {link:result(link),mensagens:result(messages).reverse()};
    },
    async createPortal(id) {
      result(await client.from('sac_links').upsert({solicitacao_id:id,token:crypto.randomUUID(),ativo:true}));
    },
    async revokePortal(id) {
      result(await client.from('sac_links').update({ativo:false}).eq('solicitacao_id',id));
    },
    async reply(id,mensagem) {
      result(await client.from('sac_mensagens').insert({solicitacao_id:id,autor:'equipe',mensagem}));
    },
    download:async record => result(await bucket.download(record.pdfPath)),
    async save(record,current) {
      const {id,pdf,...data} = record;
      const revision = crypto.randomUUID();
      const path = pdf ? id+'/'+revision+'.pdf' : null;
      if (pdf) result(await bucket.upload(path,pdf,{contentType:'application/pdf'}));
      const payload = {revision,data:{
        ...data,pdfPath:path ?? current?.pdfPath ?? null,
        pdfName:pdf?.name ?? current?.pdfName ?? null
      }};
      try {
        const query = current
          ? table().update(payload).eq('id',id).eq('revision',current.revision)
          : table().insert({id,...payload});
        if (!result(await query.select('id').maybeSingle())) throw new Error('Registro desatualizado.');
      } catch (error) {
        // Only a confirmed database rejection is safe to clean up.
        if (error.code && /^\w{5}$/.test(error.code)) await removeFile(path);
        if (error.message === 'Registro desatualizado.') await removeFile(path);
        throw error;
      }
      if (path) await removeFile(current?.pdfPath);
    },
    async remove(record) {
      const deleted = result(await table().delete().eq('id',record.id).eq('revision',record.revision).select('id').maybeSingle());
      if (!deleted) throw new Error('Registro desatualizado.');
      await removeFile(record.pdfPath);
    }
  };
}
