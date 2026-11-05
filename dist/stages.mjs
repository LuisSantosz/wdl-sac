export const baseStages = [
  {id:'nova',nome:'Em aberto',cor:'nova',ordem:0},
  {id:'andamento',nome:'Em andamento',cor:'andamento',ordem:10},
  {id:'concluida',nome:'Finalizado',cor:'concluida',ordem:100000}
];
export function buildStages(rows) {
  return [...rows].sort((a,b) => (a.ordem ?? 100)-(b.ordem ?? 100));
}
