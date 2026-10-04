// A strict animation cell contains one character body. Detached small ears,
// weapons and sparks are allowed; a second substantial figure is a layout error.
export function auditSingleBody(data,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),sizes=[];
 for(let start=0;start<w*h;start++){if(seen[start]||data[start*4+3]<=32)continue;let head=0,tail=0;queue[tail++]=start;seen[start]=1;while(head<tail){const at=queue[head++],x=at%w,y=Math.floor(at/w);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,p=ny*w+nx;if(nx<0||ny<0||nx>=w||ny>=h||seen[p]||data[p*4+3]<=32)continue;seen[p]=1;queue[tail++]=p;}}sizes.push(tail);}
 sizes.sort((a,b)=>b-a);return {bodyCount:sizes.filter(n=>n>=Math.max(300,sizes[0]*.35)).length,sizes:sizes.slice(0,4)};
}
