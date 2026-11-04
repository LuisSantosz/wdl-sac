# Publicar o WDL SAC no Render

A interface roda como um Static Site no Render. O Supabase guarda as solicitações, os PDFs e as contas da equipe. Escolha os planos gratuitos nas duas plataformas.

## 1. Configurar o Supabase

1. Crie um projeto dedicado ao SAC no plano Free.
2. No SQL Editor do projeto, execute o conteúdo de `supabase-setup.sql` uma vez. Ele cria as tabelas, um bucket privado de PDFs e as políticas que exigem autorização da equipe.
3. Em Authentication, desabilite o cadastro público e crie as contas autorizadas pelo Dashboard. Copie o ID de cada usuário. No SQL Editor, troque o exemplo pelo ID copiado e execute:

   ```sql
   insert into public.equipe_sac (user_id)
   values ('00000000-0000-0000-0000-000000000000');
   ```

4. Em `dist/cloud-config.mjs`, consulte a URL e a chave pública **publishable** já configuradas. A chave pública é feita para o navegador. Guarde chaves secretas e senhas fora do código.

## 2. Publicar no Render

1. Envie os arquivos para um repositório GitHub, incluindo a pasta `dist`.
2. No Render, escolha **New → Static Site** e conecte o repositório.
3. Selecione a branch que contém o código, use `npm ci && npm run build` no campo **Build Command** e `dist` em **Publish Directory**.
4. Abra o endereço `onrender.com` gerado pelo Render. Teste com contas e solicitações fictícias antes de cadastrar dados reais. Verifique login, exclusão, cópia da mensagem e upload e download de PDF. Uma conta fora da lista `equipe_sac` deve ficar sem acesso.

## Registros atuais e limites

- As solicitações já cadastradas no painel anterior estão salvas no navegador daquele endereço. A nova instalação começa vazia. A migração precisa ser feita separadamente.
- A versão aceita PDFs de até 20 MB. O projeto gratuito do Supabase tem cotas de banco, arquivos e tráfego. Projetos gratuitos podem ser pausados após uma semana de inatividade.
- O banco e o armazenamento de arquivos são operações separadas. Falhas de rede durante a gravação ou a exclusão podem deixar PDFs sem referência no bucket. Confira as referências antes de remover arquivos pelo Dashboard.
