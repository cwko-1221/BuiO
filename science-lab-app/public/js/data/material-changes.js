// A native inquiry with its own free-exploration engine, sharing the island's
// catalogue, account progress and settings instead of imitating linear steps.
export function materialChangesDefinition(english=false) {
  return {id:'material-changes',number:9,topic:english?'Matter':'物質',grades:english?'P3–P6':'小三至小六',minutes:18,
    title:english?'Reversible & irreversible changes':'可逆及不可逆變化',englishTitle:'Reversible & irreversible changes',
    question:english?'Can every material change back? Compare ice, charcoal, chocolate, butter, egg white and bread.':'材料發生變化後，都能恢復嗎？比較冰、炭、朱古力、牛油、蛋白和麵包。',
    color:'#5ae0b8',icon:'changes',launchPath:'/science-lab/material-changes/'};
}
