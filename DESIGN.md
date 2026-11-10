# WDL SAC — Workspace

Painel de atendimento com navegação lateral, cabeçalho compacto, indicadores de próximos retornos e área de trabalho com Kanban e lista. A referência de organização é uma ferramenta de service management; o produto mantém marca e linguagem próprias.

## Identidade

Azul é a cor de ação e seleção. Cobre distingue a identidade da central e os chamados sem próxima ação. As superfícies neutras deixam conteúdo, prazos e estados em primeiro plano. Todos os controles executam funções existentes do SAC; os indicadores usam registros reais.

| Função | Claro | Escuro |
| --- | --- | --- |
| Fundo | #F3F5FA | #000000 |
| Superfície | #FFFFFF | #121722 |
| Superfície secundária | #F7F8FC | #191F2D |
| Texto principal | #20283B | #EEF1FA |
| Texto secundário | #5B6476 | #B2BACE |
| Ação e seleção | #1762C4 | #8EC5FF |
| Identidade e próxima ação não definida | #A44716 | #FFB580 |
| Atenção e atraso | #B72743 | #FFA3B6 |
| Andamento e retorno de hoje | #8B5700 | #E9BD66 |
| Conclusão e contato | #217449 | #90D7AE |
| Navegação lateral | #172136 | #0E1420 |

As etapas personalizadas continuam com as cores escolhidas pelo usuário. Os fundos de status são variações suaves das respectivas cores. Estados também têm rótulos escritos; a cor não é o único indicador.

## Temas e acessibilidade

Os temas mudam os tokens, sem trocar a hierarquia ou reduzir o tamanho/opacidade do texto. As combinações de texto com fundo principal, cartões, controles, navegação e avisos atingem pelo menos 4,5:1. Isso é validado automaticamente em `tests/panel-palette.test.mjs`. Estados desabilitados são apresentados separadamente. Foco de teclado é visível. No celular, o menu usa controle de foco, fundo de fechamento e tecla Escape.

O fundo escuro é preto. A navegação lateral mantém sua identidade em ambos os temas, com contraste independente do tema da área de trabalho.

A marca lateral compartilha o símbolo de conversa com W e ponto cobre do favicon. O traço se desenha em ciclos suaves de cinco segundos, com pausa ao passar o mouse ou focar a marca e versão estática para movimento reduzido. Os blocos informativos e o perfil inferior foram removidos da lateral.
