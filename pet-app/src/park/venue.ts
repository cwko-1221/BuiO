export class ParkVenue{
  private root:HTMLDivElement;private abort=new AbortController();private closed=false;
  constructor(host:HTMLElement,title:string,choices:{id:string;label:string}[],english:boolean,private select:(id:string)=>void,private close:()=>void){
    this.root=document.createElement('div');this.root.className='park-leisure-venue';this.root.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="parkVenueTitle"><h3 id="parkVenueTitle"></h3><p>${english?'A little stop with different adventures. What would you like to do?':'同一個地方，也有不同的小冒險。今天想做甚麼？'}</p></section>`;const card=this.root.querySelector('section')!;card.querySelector('h3')!.textContent=title;
    for(const choice of [...choices,{id:'close',label:english?'Return to park':'先繼續逛逛'}]){const b=document.createElement('button');b.textContent=choice.label;b.dataset.venue=choice.id;card.append(b);}
    host.append(this.root);const signal=this.abort.signal;this.root.addEventListener('click',e=>{e.stopPropagation();const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-venue]');if(!b)return;const id=b.dataset.venue!;this.destroy();this.close();if(id!=='close')this.select(id);},{signal});
    window.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();this.destroy();this.close();}if(e.key==='Tab'){const buttons=[...card.querySelectorAll('button')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(e.shiftKey?i<=0:i<0||i===buttons.length-1){e.preventDefault();buttons[e.shiftKey?buttons.length-1:0].focus();}}},{signal});card.querySelector('button')?.focus();
  }
  destroy(){if(this.closed)return;this.closed=true;this.abort.abort();this.root.remove();}
}
