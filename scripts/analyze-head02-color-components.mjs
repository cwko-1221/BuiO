import sharp from 'sharp';

const [,, inputPath] = process.argv;
const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== 800 || info.height !== 640) throw new Error('expected 800x640');
const CELL = 160;
const tests = {
  blue: (r,g,b) => b >= 75 && b > r * 1.18 && b > g * 1.08,
  red: (r,g,b) => r >= 105 && r > g * 1.32 && r > b * 1.28,
  brown: (r,g,b) => r >= 35 && r <= 190 && r > g * 1.08 && g > b * 1.12 && b <= 105,
};

function componentsFor(row, column, predicate) {
  const selected = new Uint8Array(CELL * CELL);
  for (let y = 0; y < 120; y += 1) for (let x = 0; x < CELL; x += 1) {
    const at = (((row * CELL + y) * 800) + column * CELL + x) * 4;
    if (data[at + 3] && predicate(data[at],data[at+1],data[at+2])) selected[y * CELL + x] = 1;
  }
  const seen = new Uint8Array(selected.length); const components = [];
  for (let start = 0; start < selected.length; start += 1) {
    if (!selected[start] || seen[start]) continue;
    const q=[start];seen[start]=1;let size=0;let minX=160,minY=160,maxX=-1,maxY=-1;
    while(q.length){const p=q.pop();size+=1;const x=p%160,y=Math.floor(p/160);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=160||ny<0||ny>=160)continue;const n=ny*160+nx;if(selected[n]&&!seen[n]){seen[n]=1;q.push(n);}}}
    if(size>=5)components.push({size,bounds:[minX,minY,maxX,maxY]});
  }
  return components.sort((a,b)=>b.size-a.size).slice(0,12);
}
const report=[];
for(let row=0;row<4;row+=1)for(let column=0;column<5;column+=1){const cell={row,column};for(const [name,test] of Object.entries(tests))cell[name]=componentsFor(row,column,test);report.push(cell);}
console.log(JSON.stringify(report,null,2));
