# WDL SAC — interface inspirada no iOS

Superfícies agrupadas, cantos arredondados, tipografia do sistema, controles segmentados e barra superior translúcida. As cores indicam função; textos identificam os estados sem depender somente da cor.

| Função | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| Fundo | #F2F2F7 | #000000 | Área de trabalho |
| Superfície | #FFFFFF | #1C1C1E | Cartões, diálogos e painéis |
| Texto | #1C1C1E | #F5F5F7 | Conteúdo principal |
| Texto secundário | #626773 | #A6A9B3 | Descrições, datas e orientações |
| Azul | #0066CC | #78B6FF | Ações principais, foco, navegação e informação |
| Vermelho | #BD2637 | #FF9DA8 | Atenção, chamados abertos e retornos atrasados |
| Amarelo | #865300 | #F3CD73 | Em andamento e retorno no dia atual |
| Verde | #237143 | #8ED6A1 | Conclusão e contato por WhatsApp |
| Roxo | #7442B0 | #CBA6FF | Opção para etapas específicas |
| Laranja | #975000 | #FFC083 | Opção para etapas que demandam ação |

As etapas personalizadas preservam a cor escolhida pelo usuário. Botões de exclusão usam fundo vermelho com texto branco; no tema escuro, os demais botões principais usam fundo azul claro com texto azul profundo. Cores de status recebem fundos suaves definidos nos tokens `--rbg`, `--ybg`, `--gbg` e `--total-bg`. A busca usa o mesmo azul de foco dos demais campos.
