export const baseStages = [
  {id:'nova',nome:'Em aberto',cor:'nova'},
  {id:'andamento',nome:'Em andamento',cor:'andamento'},
  {id:'concluida',nome:'Finalizado',cor:'concluida'}
];
export function buildStages(custom) {
  return [...baseStages.slice(0,2),...custom,baseStages[2]];
}
