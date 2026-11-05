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

## Etapas personalizadas

Execute `supabase-etapas.sql` uma vez em instalações existentes, após `supabase-acompanhamento.sql`. A migração cria as etapas compartilhadas com acesso restrito à equipe e atualiza o portal do cliente.

No painel, clique em **＋ Nova etapa**, informe um nome e escolha uma cor. A nova coluna aparece antes de **Finalizado**. Para mover um chamado, use a seleção de etapa no próprio card ou no formulário da solicitação. Todas as etapas, incluindo as originais, podem ser renomeadas ou excluídas; mantenha ao menos uma etapa. Nomes repetidos são bloqueados; a importação do CRM preserva a etapa escolhida. O cliente também vê o nome da etapa atual no link de acompanhamento.

### Edição, exclusão e movimentação

Após a migração anterior, execute `supabase-editar-etapas.sql`. Ela cadastra as etapas originais na configuração compartilhada, mantém os chamados existentes e adiciona uma referência que impede salvar chamados em etapas inexistentes.

- Clique no lápis do cabeçalho da coluna para alterar nome e cor.
- Para excluir uma etapa, escolha a coluna de destino. A operação move os chamados, registra a alteração no histórico e só então exclui a etapa, em uma única transação.
- Clique no motivo exibido no card (por exemplo, **Defeito**) para editá-lo. Também é possível escrever um motivo livre no formulário. A descrição original do CRM continua disponível para consulta; a reimportação preserva o motivo editado.
- Arraste o card para outra coluna com o mouse. Em telas sensíveis ao toque, use a área **Arrastar chamado**. A seleção de etapa permanece disponível para navegação por teclado.
- Se **Em aberto** for excluída, os próximos chamados importados entram na primeira etapa disponível.

## Prazos, lista e organização individual

Após as migrações anteriores, execute `supabase-reordenar-etapas.sql`. A gravação da ordem mantém as políticas RLS que restringem a edição aos usuários cadastrados em `equipe_sac`.

- No card, clique em **Agendar próxima ação** para informar a data e o que fazer. Marque a ação como concluída depois do retorno. Alterar a data desmarca a conclusão.
- Datas são avaliadas pelo calendário de São Paulo: o dia atual é **hoje** e dias anteriores são **atrasados**. O destaque é atualizado enquanto a página está aberta, inclusive na virada do dia. Esses prazos são internos; não geram mensagens externas automáticas.
- Use os filtros de prazo no Kanban ou na **Lista**. A lista permite filtrar a etapa e ordenar pela próxima ação. A escolha Kanban/Lista fica salva no navegador.
- Arraste o cabeçalho de uma coluna para outra posição para salvar a ordem. As pequenas setas do cabeçalho oferecem a mesma função por teclado ou toque.
- Não há atribuição obrigatória de responsáveis: os cards identificam o atendimento individual como **você**.
- Os dados da próxima ação são preservados na reimportação do CRM. Etapas e chamados existentes não recebem prazos presumidos a partir do nome das colunas.

Validação das regras de prazo: `node --test tests/case-utils.test.mjs`.
