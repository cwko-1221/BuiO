// Shared puzzle rules. The server owns tickets and checks every completion.
export const PIPE_SOLUTION = [6, 12, 6, 9, 5, 6, 3, 3, 9];
export function rotatePipe(mask, turns = 1) {
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) mask = ((mask << 1) & 15) | (mask >> 3);
  return mask;
}
export function pipeFlow(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== 9 || tiles.some(m => !Number.isInteger(m) || m < 1 || m > 15)) return [];
  if (!(tiles[3] & 8)) return [];
  const queue = [3], seen = new Set(queue), directions = [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]];
  while (queue.length) {
    const i = queue.shift();
    for (const [bit, dx, dy, opposite] of directions) {
      if (!(tiles[i] & bit)) continue;
      const x = i % 3 + dx, y = Math.floor(i / 3) + dy;
      if (x < 0 || y < 0 || x > 2 || y > 2) continue;
      const next = y * 3 + x;
      if (!seen.has(next) && (tiles[next] & opposite)) { seen.add(next); queue.push(next); }
    }
  }
  return [...seen];
}
export function createChallenge(mode, objectId, seed = 1) {
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  if(mode==='maze'){
    const cells=Array(25).fill(0),seen=new Set([0]),stack=[0];
    while(stack.length){const at=stack.at(-1),x=at%5,y=Math.floor(at/5),options=[[1,at-5,y>0,4],[2,at+1,x<4,8],[4,at+5,y<4,1],[8,at-1,x>0,2]].filter(([,n,valid])=>valid&&!seen.has(n));if(!options.length){stack.pop();continue;}const [bit,next,,back]=options[Math.floor(random()*options.length)];cells[at]|=bit;cells[next]|=back;seen.add(next);stack.push(next);}
    return{mode,objectId,cells,size:5,minimumMs:1400};
  }
  if (mode === 'search') return { mode, objectId, target: Math.floor(random() * 6), minimumMs: 900 };
  if (mode === 'water') return { mode, objectId, targets: [25, 55, 80].map(n => n + Math.floor(random() * 8)), minimumMs: 1800 };
  if (mode === 'sort') return { mode, objectId, answer: ({ 'litter-a': 'paper', 'litter-b': 'recycle', 'litter-c': 'compost' })[objectId], minimumMs: 900 };
  if (mode === 'melody') {
    const length = objectId === 'bell' ? 5 : objectId === 'drum' ? 4 : 3;
    return { mode, objectId, notes: Array.from({ length }, () => Math.floor(random() * 4)), minimumMs: length * 650 + 400 };
  }
  if (mode === 'code') return { mode, objectId, minimumMs: 1200 };
  if (mode === 'pipes') return { mode, objectId, tiles: PIPE_SOLUTION.map(mask => rotatePipe(mask, 1 + Math.floor(random() * 3))), minimumMs: 1800 };
  throw Error('Unknown park activity');
}
export function verifyChallenge(challenge, answer) {
  if(challenge.mode==='maze'){
    if(!Array.isArray(answer)||answer.length<2||answer.length>1000||answer[0]!==0||answer.at(-1)!==24||answer.some(n=>!Number.isInteger(n)||n<0||n>24))return false;
    return answer.slice(1).every((n,i)=>{const from=answer[i],dx=n%5-from%5,dy=Math.floor(n/5)-Math.floor(from/5),bit=dx===1&&dy===0?2:dx===-1&&dy===0?8:dy===1&&dx===0?4:dy===-1&&dx===0?1:0;return bit&&!!(challenge.cells[from]&bit);});
  }
  if (challenge.mode === 'search') return answer === challenge.target;
  if (challenge.mode === 'sort') return answer === challenge.answer;
  if (challenge.mode === 'code') return answer === '243';
  if (challenge.mode === 'melody') return Array.isArray(answer) && answer.length === challenge.notes.length && answer.every((n, i) => n === challenge.notes[i]);
  if (challenge.mode === 'water') return Array.isArray(answer) && answer.length === 3 && answer.every((n, i) => typeof n === 'number' && Math.abs(n - challenge.targets[i]) <= 13);
  if (challenge.mode === 'pipes') return Array.isArray(answer) && answer.length === 9 && answer.every((n, i) => [0, 1, 2, 3].some(turn => rotatePipe(challenge.tiles[i], turn) === n)) && pipeFlow(answer).includes(5) && !!(answer[5] & 2);
  return false;
}
export function publicChallenge(challenge) {
  const { target, answer, ...publicData } = challenge;
  // Search clues indicate the actual spot without exposing a submit-ready answer.
  if (challenge.mode === 'search') publicData.hint = ['左上方的葉子有動靜', '上排中央透出一點光', '右上方露出了一角', '左下方的葉堆鼓起來', '下排中央有新腳印', '右下方有一片金色的葉'][target];
  return publicData;
}
