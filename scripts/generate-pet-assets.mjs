import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');
const root = path.resolve('pet-app/public/assets/art');
const generatedPath = (folder,id) => `${folder}/${id}-${createHash('sha256').update(`${catalog.version}:${folder}:${id}`).digest('hex').slice(0,10)}.webp`;

const mix = (hex, toward = '#ffffff', amount = .25) => {
  const parse = (value) => [1,3,5].map((index) => Number.parseInt(value.slice(index,index+2),16));
  const [r,g,b] = parse(hex); const [rr,gg,bb] = parse(toward);
  return `#${[r+(rr-r)*amount,g+(gg-g)*amount,b+(bb-b)*amount].map((v)=>Math.round(v).toString(16).padStart(2,'0')).join('')}`;
};
const safe = (value) => String(value).replace(/[&<>"']/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' })[char]);
const svg = (width,height,content,transparent=false) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="soft"><feGaussianBlur stdDeviation="9"/></filter><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="9" flood-color="#18304a" flood-opacity=".22"/></filter><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".82"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient></defs>${transparent?'':`<rect width="100%" height="100%" fill="#f7f0e5"/>`}${content}</svg>`;
const writeWebp = async (relative, source, options={ quality: 88 }) => {
  const target = path.join(root, relative); await fs.mkdir(path.dirname(target),{recursive:true});
  await sharp(Buffer.from(source)).webp(options).toFile(target); return target;
};

function speciesParts(body,color,light,stage) {
  const dark=mix(color,'#172641',.38), pale=mix(color,'#ffffff',.48); let behind='',ears='',face='',tail='',extras='';
  const wing=(side)=>`<path d="M${side<0?250:390} 330 C${side<0?125:515} 238 ${side<0?112:528} 430 ${side<0?276:364} 418 C${side<0?224:416} 380 ${side<0?215:425} 335 ${side<0?250:390} 330Z" fill="${light}" stroke="${dark}" stroke-width="12"/>`;
  switch(body){
    case 'cat': ears=`<path d="M238 198L258 96l82 91M402 198L382 96l-82 91" fill="${light}" stroke="${dark}" stroke-width="14" stroke-linejoin="round"/>`;tail=`<path d="M425 390q150 20 88-122" fill="none" stroke="${dark}" stroke-width="33" stroke-linecap="round"/>`;break;
    case 'dog': ears=`<path d="M249 177q-86-67-76 77q16 59 86 16M391 177q86-67 76 77q-16 59-86 16" fill="${dark}" stroke="${dark}" stroke-width="10"/>`;tail=`<path d="M426 391q129-31 63-113" fill="none" stroke="${color}" stroke-width="36" stroke-linecap="round"/>`;break;
    case 'pig': ears=`<path d="M250 192l-55-84q97-8 104 70M390 192l55-84q-97-8-104 70" fill="${light}" stroke="${dark}" stroke-width="13"/>`;face=`<ellipse cx="320" cy="278" rx="61" ry="38" fill="${pale}" stroke="${dark}" stroke-width="9"/><circle cx="299" cy="278" r="8" fill="${dark}"/><circle cx="341" cy="278" r="8" fill="${dark}"/>`;tail=`<path d="M433 394q103-38 40-91q-34-21-41 17q0 35 46 25" fill="none" stroke="${color}" stroke-width="22" stroke-linecap="round"/>`;break;
    case 'rabbit': ears=`<ellipse cx="265" cy="112" rx="38" ry="113" transform="rotate(-12 265 112)" fill="${light}" stroke="${dark}" stroke-width="13"/><ellipse cx="375" cy="112" rx="38" ry="113" transform="rotate(12 375 112)" fill="${light}" stroke="${dark}" stroke-width="13"/><ellipse cx="265" cy="112" rx="12" ry="75" transform="rotate(-12 265 112)" fill="#f3a7b7"/><ellipse cx="375" cy="112" rx="12" ry="75" transform="rotate(12 375 112)" fill="#f3a7b7"/>`;tail=`<circle cx="450" cy="414" r="46" fill="${pale}" stroke="${dark}" stroke-width="10"/>`;break;
    case 'otter': ears=`<circle cx="247" cy="189" r="43" fill="${light}" stroke="${dark}" stroke-width="13"/><circle cx="393" cy="189" r="43" fill="${light}" stroke="${dark}" stroke-width="13"/>`;tail=`<path d="M437 414q153 39 79 107q-59 41-114-50" fill="${dark}" stroke="${dark}" stroke-width="12"/>`;face=`<ellipse cx="320" cy="279" rx="70" ry="48" fill="${pale}"/><circle cx="320" cy="264" r="12" fill="${dark}"/>`;break;
    case 'turtle': behind=`<ellipse cx="320" cy="387" rx="174" ry="133" fill="${dark}" stroke="#355745" stroke-width="14"/><path d="M205 360h230M232 308l176 155M408 308L232 463" stroke="${light}" stroke-width="11" opacity=".55"/>`;ears='';tail=`<path d="M464 408l75 35-81 26" fill="${light}" stroke="${dark}" stroke-width="11"/>`;break;
    case 'hamster': ears=`<circle cx="242" cy="182" r="53" fill="${light}" stroke="${dark}" stroke-width="13"/><circle cx="398" cy="182" r="53" fill="${light}" stroke="${dark}" stroke-width="13"/><circle cx="242" cy="182" r="24" fill="#f2a8b3"/><circle cx="398" cy="182" r="24" fill="#f2a8b3"/>`;face=`<ellipse cx="265" cy="286" rx="42" ry="51" fill="${pale}"/><ellipse cx="375" cy="286" rx="42" ry="51" fill="${pale}"/>`;break;
    case 'fox': ears=`<path d="M220 198L247 65l100 124M420 198L393 65 293 189" fill="${light}" stroke="${dark}" stroke-width="14" stroke-linejoin="round"/>`;tail=`<path d="M427 407q170 27 95 128q-51 64-141-17q77-10 65-68" fill="${color}" stroke="${dark}" stroke-width="13"/><path d="M500 502q24-24 25-54q59 68-3 87q-28 8-59-11" fill="${pale}"/>`;break;
    case 'penguin': behind=`${wing(-1)}${wing(1)}`;face=`<ellipse cx="320" cy="276" rx="99" ry="111" fill="${pale}"/><path d="M295 284l25-18 25 18-25 21z" fill="#edaa43"/>`;break;
    case 'goat': ears=`<path d="M250 200q-94-49-79 37q49 48 105 14M390 200q94-49 79 37q-49 48-105 14" fill="${light}" stroke="${dark}" stroke-width="12"/>`;extras=`<path d="M269 181q-54-102 4-103q43 9 19 100M371 181q54-102-4-103q-43 9-19 100" fill="none" stroke="#dfbd82" stroke-width="26" stroke-linecap="round"/>`;break;
    case 'seal': ears='';behind=`<path d="M233 406q-112 46-83 114q88-3 133-83M407 406q112 46 83 114q-88-3-133-83" fill="${light}" stroke="${dark}" stroke-width="12"/>`;face=`<ellipse cx="320" cy="278" rx="64" ry="42" fill="${pale}"/><path d="M320 268v25m-5-8l-65-14m75 14l65-14" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>`;break;
    case 'panda': ears=`<circle cx="236" cy="180" r="54" fill="${dark}"/><circle cx="404" cy="180" r="54" fill="${dark}"/>`;face=`<ellipse cx="271" cy="254" rx="33" ry="48" fill="${dark}" transform="rotate(25 271 254)"/><ellipse cx="369" cy="254" rx="33" ry="48" fill="${dark}" transform="rotate(-25 369 254)"/>`;break;
    case 'bat': behind=`${wing(-1)}${wing(1)}`;ears=`<path d="M245 205l8-126 73 107M395 205l-8-126-73 107" fill="${dark}" stroke="${dark}" stroke-width="12"/>`;break;
    case 'deer': ears=`<path d="M255 200q-99-45-73 48q50 43 101 7M385 200q99-45 73 48q-50 43-101 7" fill="${light}" stroke="${dark}" stroke-width="12"/>`;extras=`<path d="M270 188q-47-65-33-118m16 49-39-23m53 3 17-43M370 188q47-65 33-118m-16 49 39-23m-53 3-17-43" fill="none" stroke="#e7d5bc" stroke-width="15" stroke-linecap="round"/>`;break;
    case 'raccoon': ears=`<circle cx="246" cy="182" r="47" fill="${dark}"/><circle cx="394" cy="182" r="47" fill="${dark}"/>`;face=`<path d="M225 232q95-63 190 0q-30 101-95 59q-65 42-95-59" fill="${dark}" opacity=".86"/>`;tail=`<path d="M425 405q159 17 104 111q-67 62-134-27" fill="none" stroke="${dark}" stroke-width="54" stroke-linecap="round"/><path d="M484 438l34 30M456 475l42 35" stroke="${pale}" stroke-width="22"/>`;break;
    case 'dragon': behind=`${wing(-1)}${wing(1)}`;ears=`<path d="M253 188l-15-112 76 94M387 188l15-112-76 94" fill="${dark}" stroke="${dark}" stroke-width="12"/>`;tail=`<path d="M421 407q184 60 76 133" fill="none" stroke="${dark}" stroke-width="41" stroke-linecap="round"/><path d="M500 517l42-23-14 52" fill="#ffd56e"/>`;extras=`<path d="M292 168l28-108 28 108" fill="#f6d36d" stroke="${dark}" stroke-width="11"/>`;break;
    case 'slime': face='';ears='';behind=`<path d="M168 440q20-246 152-269q132 23 152 269l54 63q-82 38-144 1q-62 51-124 0q-69 36-144-1z" fill="${color}" stroke="${dark}" stroke-width="16"/>`;break;
    case 'squid': behind=`<path d="M229 393q-60 147 21 150q64 2 44-113q-8 121 48 120q64-1 19-126q12 114 65 100q66-19-19-144" fill="none" stroke="${color}" stroke-width="45" stroke-linecap="round"/>`;ears=`<path d="M236 222q84-187 168 0" fill="${light}" stroke="${dark}" stroke-width="14"/>`;break;
    case 'kirin': ears=`<path d="M246 201q-81-58-71 34q47 47 102 15M394 201q81-58 71 34q-47 47-102 15" fill="${light}" stroke="${dark}" stroke-width="12"/>`;extras=`<path d="M320 179L348 42l28 143" fill="#ffe56c" stroke="${dark}" stroke-width="12"/><path d="M240 193q34-121 92-94q58 28 72 102" fill="none" stroke="#ecf8ff" stroke-width="26"/>`;tail=`<path d="M429 405q131-25 92-124" fill="none" stroke="#f1f7ff" stroke-width="35" stroke-linecap="round"/>`;break;
    default: ears=`<path d="M250 195L205 79l103 94M390 195l45-116-103 94" fill="${light}" stroke="${dark}" stroke-width="14"/>`;extras=`<path d="M226 187q22-115 92-74q55-59 104 63" fill="none" stroke="#78c87f" stroke-width="25"/><circle cx="238" cy="93" r="24" fill="#9cdf79"/><circle cx="404" cy="102" r="27" fill="#6fb965"/>`;tail=`<path d="M424 408q153 4 115-105" fill="none" stroke="#5d9362" stroke-width="39" stroke-linecap="round"/>`;
  }
  return {behind,ears,face,tail,extras,dark,pale};
}

function petSvg(pet,stage){
  const color=pet.color, light=mix(color,'#ffffff',.2+stage*.04); const p=speciesParts(pet.body,color,light,stage);
  const stageGlow=stage>=4?`<circle cx="320" cy="310" r="243" fill="none" stroke="#ffe991" stroke-width="9" stroke-dasharray="8 24" opacity=".8"/><circle cx="320" cy="310" r="216" fill="${color}" opacity=".08"/>`:'';
  const armour=stage>=3?`<path d="M208 367q112-58 224 0l-25 118q-87 53-174 0z" fill="url(#shine)" stroke="#fff1a6" stroke-width="9" opacity=".82"/>`:'';
  const crest=stage>=2?`<path d="M266 191q54-87 108 0q-17-24-54-2q-37-22-54 2" fill="#ffe582" stroke="${p.dark}" stroke-width="10"/>`:'';
  const body=pet.body==='slime'?'':`<ellipse cx="320" cy="406" rx="${125+stage*8}" ry="${105+stage*7}" fill="${color}" stroke="${p.dark}" stroke-width="15"/><circle cx="320" cy="248" r="${105+stage*4}" fill="${light}" stroke="${p.dark}" stroke-width="15"/>`;
  return svg(640,640,`<ellipse cx="320" cy="539" rx="180" ry="35" fill="#20324d" opacity=".17" filter="url(#soft)"/>${stageGlow}<g filter="url(#shadow)">${p.tail}${p.behind}${p.extras}${p.ears}${body}${armour}${crest}${p.face}<ellipse cx="278" cy="247" rx="14" ry="20" fill="#203149"/><ellipse cx="362" cy="247" rx="14" ry="20" fill="#203149"/><circle cx="282" cy="241" r="5" fill="#fff"/><circle cx="366" cy="241" r="5" fill="#fff"/><path d="M302 297q18 18 36 0" fill="none" stroke="#70435b" stroke-width="8" stroke-linecap="round"/><circle cx="254" cy="287" r="17" fill="#f29aaa" opacity=".48"/><circle cx="386" cy="287" r="17" fill="#f29aaa" opacity=".48"/></g>`,true);
}

function roomSvg(room,index){
  const a=room.primary,b=room.accent,pale=mix(a,'#ffffff',.68),dark=mix(a,'#243149',.25);
  const motifs=['☀','☁','≈','♧','✦','●','▲','✧','竹','☾'];
  return svg(1600,900,`<rect width="1600" height="900" fill="${pale}"/><path d="M90 95L800 355V855L90 560Z" fill="${mix(a,'#ffffff',.53)}"/><path d="M1510 95L800 355V855l710-295Z" fill="${mix(b,'#ffffff',.47)}"/><path d="M90 560l710-205 710 205-710 295z" fill="${mix(a,'#ffffff',.25)}"/><path d="M90 560l710 295 710-295" fill="none" stroke="${dark}" stroke-width="18" opacity=".2"/><path d="M800 355V855" stroke="#fff" stroke-width="7" opacity=".32"/>
  <g filter="url(#shadow)"><path d="M178 306l262 94v211l-262-99z" fill="${dark}" opacity=".16"/><rect x="228" y="205" width="190" height="192" rx="92" fill="#e9f7ff" stroke="#fff" stroke-width="18"/><circle cx="325" cy="291" r="48" fill="${b}" opacity=".35"/><path d="M920 552l260 81v133l-260 65z" fill="${dark}" opacity=".18"/><path d="M875 504l261 71-36 81-262-75z" fill="${a}"/><path d="M1015 484v-119m0 0q90 20 119 99m-119-99q-72 23-94 102" stroke="${dark}" stroke-width="19" fill="none" stroke-linecap="round"/><circle cx="1015" cy="345" r="31" fill="#fff3a3"/><path d="M447 631l188-57 199 80-190 69z" fill="${b}" opacity=".72"/><ellipse cx="638" cy="648" rx="86" ry="31" fill="#fff" opacity=".25"/><path d="M1262 295v192l127-52V251z" fill="${dark}" opacity=".17"/><path d="M1268 302v165l109-44V270z" fill="#f8fbff" opacity=".85"/></g><text x="800" y="170" text-anchor="middle" font-size="112" font-family="Arial" fill="${dark}" opacity=".22">${safe(motifs[index])}</text>`,false);
}

function mapSvg(map,index){
  const c=map.color,pale=mix(c,'#ffffff',.35),dark=mix(c,'#14233d',.4);
  const detail=Array.from({length:55},(_,i)=>{const x=55+((i*271+index*91)%1490),y=55+((i*157+index*61)%890),r=9+(i%5)*4;return `<circle cx="${x}" cy="${y}" r="${r}" fill="${i%3?dark:'#ffffff'}" opacity="${i%3?.12:.16}"/>`;}).join('');
  return svg(1600,1000,`<rect width="1600" height="1000" fill="${dark}"/><path d="M-80 490C170 170 390 780 640 438S1080 170 1680 474V1120H-80Z" fill="${c}"/><path d="M-90 608C214 302 400 848 710 538S1192 278 1680 592" fill="none" stroke="${pale}" stroke-width="170" stroke-linecap="round" opacity=".82"/><path d="M-90 608C214 302 400 848 710 538S1192 278 1680 592" fill="none" stroke="#fff5d7" stroke-width="86" stroke-linecap="round" opacity=".7"/>${detail}<g opacity=".8"><circle cx="188" cy="180" r="76" fill="${pale}"/><circle cx="1390" cy="792" r="98" fill="${dark}"/><path d="M1234 179l82 140-164 0z" fill="${pale}"/><path d="M314 770l75-130 75 130z" fill="${dark}"/></g><path d="M790 92l38 85 92 10-69 62 19 91-80-46-80 46 19-91-69-62 92-10z" fill="#fff3a0" opacity=".82"/>`,false);
}

function itemSvg(kind,index){
  const colors=['#f6b45f','#67bed0','#7dc681','#9a7bd1','#ee7f71','#f2d05f','#6c7ea5','#eea5c1','#87b96b','#d88c58']; const c=colors[index%colors.length],d=mix(c,'#243149',.35);
  const glyph=kind==='head'?`<path d="M196 337q124-201 248 0l-62 70H258z"/><circle cx="320" cy="238" r="65"/>`:kind==='face'?`<path d="M178 289h82l34 45h52l34-45h82" fill="none" stroke-width="25"/><circle cx="244" cy="322" r="68" fill="none" stroke-width="22"/><circle cx="396" cy="322" r="68" fill="none" stroke-width="22"/>`:kind==='neck'?`<path d="M179 234q141 154 282 0l-43 152q-98 77-196 0z"/><circle cx="320" cy="395" r="39" fill="#fff0a0"/>`:kind==='back'?`<path d="M314 350Q132 138 127 372q78 68 187 8m12-30Q508 138 513 372q-78 68-187 8"/>`:kind==='aura'?`<circle cx="320" cy="320" r="164" fill="none" stroke-width="28" stroke-dasharray="15 22"/><path d="M320 125l26 68 73-13-57 47 42 61-69-28-15 72-15-72-69 28 42-61-57-47 73 13z"/>`:`<path d="M158 411l69-195h186l69 195z"/><rect x="210" y="269" width="220" height="162" rx="22"/>`;
  return svg(640,640,`<rect x="70" y="70" width="500" height="500" rx="90" fill="${mix(c,'#ffffff',.75)}"/><g fill="${c}" stroke="${d}" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">${glyph}</g><circle cx="462" cy="174" r="34" fill="#fff" opacity=".75"/>`,true);
}

const ACTIONS=['idle','walk','auto-attack','active-skill','hit','faint-return','eat','happy','play','sleep','hatch','evolve'];
const DIRECTIONS=['front','right','back','left'];
async function spriteAtlas(pet,stage){
  const cell=192; const source=Buffer.from(petSvg(pet,stage)); const frames=[];
  const angles=[0,-4,5,-10,9,70,0,-7,6,76,0,0]; const scales=[.88,.9,.91,.98,.86,.76,.93,.91,.88,.72,.72,1];
  for(let action=0;action<ACTIONS.length;action+=1){
    const size=Math.round(176*scales[action]);
    const normal=await sharp(source).rotate(angles[action],{background:{r:0,g:0,b:0,alpha:0}}).resize(size,size,{fit:'contain'}).webp({quality:84}).toBuffer();
    const mirrored=await sharp(normal).flop().webp({quality:84}).toBuffer(); frames.push({normal,mirrored,size});
  }
  const composite=[];
  for(let direction=0;direction<DIRECTIONS.length;direction+=1) for(let action=0;action<ACTIONS.length;action+=1){
    const frame=frames[action]; const bounce=[4,-2,1,-5,5,10,2,-6,-2,9,4,-8][action];
    composite.push({input:direction===3?frame.mirrored:frame.normal,left:action*cell+Math.round((cell-frame.size)/2),top:direction*cell+Math.round((cell-frame.size)/2)+bounce});
  }
  const relative=generatedPath('sprites',`${pet.id}-${stage}-atlas`); const target=path.join(root,relative); await fs.mkdir(path.dirname(target),{recursive:true});
  await sharp({create:{width:cell*ACTIONS.length,height:cell*DIRECTIONS.length,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composite).webp({quality:84}).toFile(target);
  return `/pet/assets/art/${relative}`;
}

function enemySvg(index,boss=false){
  const colors=['#7f63b4','#58a976','#df6f75','#579bea','#efc14c','#8e7454','#7085a1','#b16bc6','#43aa98','#df8452','#687184','#78a957'];
  const color=colors[index%colors.length],dark=mix(color,'#172641',.42),size=boss?142:105;
  return svg(320,320,`<ellipse cx="160" cy="265" rx="${boss?104:76}" ry="25" fill="#203149" opacity=".18"/><g filter="url(#shadow)"><path d="M${160-size} 185q${size} ${-170-(index%4)*12} ${size*2} 0v66H${160-size}z" fill="${color}" stroke="${dark}" stroke-width="${boss?14:10}"/><path d="M${160-size+18} 181l${22+index%4*8}-77 42 77M${160+size-18} 181l-${22+index%4*8}-77-42 77" fill="${mix(color,'#ffffff',.18)}" stroke="${dark}" stroke-width="10"/><circle cx="125" cy="191" r="18" fill="#fff"/><circle cx="195" cy="191" r="18" fill="#fff"/><circle cx="130" cy="196" r="8" fill="${dark}"/><circle cx="200" cy="196" r="8" fill="${dark}"/>${boss?`<path d="M89 122l71-82 71 82-71-29z" fill="#ffe181" stroke="${dark}" stroke-width="12"/>`:''}</g>`,true);
}

function effectSvg(skill,index){
  const colors={fire:'#ef6f43',water:'#4db9d2',nature:'#68b86e',electric:'#f1cb4c',ice:'#9bddeb',cosmic:'#9b77dd',shadow:'#62577f',wind:'#7ecad0',earth:'#a57c55',light:'#f3d76c'};
  const color=colors[skill.element]||colors.light; const rays=Array.from({length:12},(_,i)=>`<rect x="310" y="48" width="20" height="86" rx="10" fill="${color}" transform="rotate(${i*30} 320 320)" opacity="${.4+(i%3)*.2}"/>`).join('');
  return svg(640,640,`${rays}<circle cx="320" cy="320" r="168" fill="${color}" opacity=".14"/><circle cx="320" cy="320" r="120" fill="none" stroke="${color}" stroke-width="22" stroke-dasharray="22 16"/><path d="M320 170l41 101 109 12-82 73 24 108-92-56-92 56 24-108-82-73 109-12z" fill="${mix(color,'#ffffff',.25)}" stroke="#fff" stroke-width="9" opacity=".9"/>`,true);
}

async function main(){
  await fs.rm(root,{recursive:true,force:true});
  await fs.mkdir(root,{recursive:true});
  for(const pet of catalog.pets) for(let stage=1;stage<=4;stage+=1) await writeWebp(pet.art[stage-1].split('?')[0].split('/art/')[1],petSvg(pet,stage));
  const spriteSheets=[]; for(const pet of catalog.pets) for(let stage=1;stage<=4;stage+=1) spriteSheets.push(await spriteAtlas(pet,stage));
  await fs.mkdir(path.join(root,'sprites'),{recursive:true}); await fs.writeFile(path.join(root,'sprites/manifest.json'),JSON.stringify({frameWidth:192,frameHeight:192,columns:ACTIONS,rows:DIRECTIONS,sheets:spriteSheets},null,2));
  for(const [index,room] of catalog.rooms.entries()) {
    const imagegenSource = room.id === 'sunny-oak' ? path.resolve('pet-app/art-source/imagegen/sunny-oak-key-art.png') : '';
    if (imagegenSource && await fs.stat(imagegenSource).then(()=>true).catch(()=>false)) {
      const target=path.join(root,room.art.split('?')[0].split('/art/')[1]); await fs.mkdir(path.dirname(target),{recursive:true});
      await sharp(imagegenSource).resize(1600,900,{fit:'cover'}).webp({quality:91}).toFile(target);
    } else await writeWebp(room.art.split('?')[0].split('/art/')[1],roomSvg(room,index),{quality:90});
  }
  for(const [index,map] of catalog.maps.entries()) await writeWebp(map.art.split('?')[0].split('/art/')[1],mapSvg(map,index),{quality:88});
  for(const [index,slot] of ['head','face','neck','back','aura'].entries()) await writeWebp(generatedPath('items',slot),itemSvg(slot,index));
  for(const [index,room] of catalog.rooms.entries()) await writeWebp(generatedPath('items',`${room.id}-furniture`),itemSvg('furniture',index));
  for(const [index,item] of catalog.wearables.entries()) await writeWebp(item.art.split('?')[0].split('/art/')[1],itemSvg(item.slot,index));
  for(const [index,item] of catalog.furniture.entries()) await writeWebp(item.art.split('?')[0].split('/art/')[1],itemSvg('furniture',index));
  for(let index=0;index<12;index+=1) await writeWebp(generatedPath('enemies',`family-${String(index+1).padStart(2,'0')}`),enemySvg(index));
  for(const [index,map] of catalog.maps.entries()) await writeWebp(generatedPath('bosses',`${map.id}-boss`),enemySvg(index,true));
  for(const [index,skill] of catalog.skills.entries()) await writeWebp(generatedPath('effects',skill.id),effectSvg(skill,index));
  await fs.mkdir(path.join(root,'layers/maps'),{recursive:true}); await fs.mkdir(path.join(root,'layers/rooms'),{recursive:true});
  for(const [index,map] of catalog.maps.entries()) await fs.writeFile(path.join(root,`layers/maps/${map.id}.json`),JSON.stringify({mapId:map.id,size:[1600,1000],playerSpawn:[180,500],bossSpawn:[1320,500],mainPath:[[0,608],[214,302],[400,848],[710,538],[1192,278],[1600,592]],explorationBranches:[[520,590,390,210],[940,420,1100,760]],collision:[['bounds',0,0,1600,1000]],enemyWaves:3,boss:map.boss,badge:map.badgeId},null,2));
  for(const room of catalog.rooms) await writeWebp(generatedPath('layers/rooms',`${room.id}-foreground`),svg(1600,900,`<path d="M35 820L800 885l765-65" fill="none" stroke="${room.accent}" stroke-width="34" opacity=".4"/><path d="M38 105v715M1562 105v715" stroke="${room.primary}" stroke-width="22" opacity=".28"/>`,true));
  const manifest={version:catalog.version,style:'original soft hand-drawn cartoon',pets:catalog.pets.flatMap((pet)=>pet.art),spriteAtlases:{count:80,actions:ACTIONS,directions:DIRECTIONS},rooms:catalog.rooms.map((room)=>room.art),maps:catalog.maps.map((map)=>map.art),collectibles:{wearables:80,furniture:100},enemies:12,bosses:10,skillEffects:16,itemAtlases:15,audio:{musicThemes:12,petVoiceVariants:20,sfxEvents:15,generator:'WebAudio note events; no third-party audio'},generatedAt:new Date().toISOString()};
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
  await fs.writeFile(path.join(root,'PROMPTS.md'),`# Pet Paradise original asset prompts\n\nMode: deterministic SVG-to-WebP production pipeline, plus built-in ImageGen art-direction key art.\n\n## Character seed prompt\n\nOriginal soft hand-painted chibi creature, clear tablet silhouette, front three-quarter pose, bottom-center anchor, clean outline, four progressive evolution stages, unique anatomy and elemental motifs, no lettering, no trademarked characters, transparent background.\n\n## Bedroom prompt\n\nOriginal cozy hand-painted isometric dollhouse bedroom, layered walls and diamond floor, generous play area, warm child-safe palette, readable at tablet size, no people, no lettering, no brand elements.\n\n### ImageGen production prompt — Sunny Oak Bedroom\n\nCreate an original polished 2D hand-painted cartoon game background for a children's virtual pet bedroom. Isometric dollhouse cutaway view, 16:9 landscape. Theme: Sunny Oak Bedroom, warm honey oak floor, cream plaster walls, large round sunrise window, mint and peach accents, cozy pet bed, low bookshelf, rug, lamp, potted plant, toy basket, small desk. Keep a large uncluttered diamond-shaped central floor area for a cute pet avatar and draggable furniture. Soft watercolor-gouache texture, friendly rounded shapes, clear silhouettes at tablet size, layered-feeling depth, gentle morning light, no people, no pets, no text, no logos, no copyrighted characters. The room must feel premium and playable, with the floor plane clearly readable.\n\nSource: pet-app/art-source/imagegen/sunny-oak-key-art.png. This is non-transparent room art, so no chroma-key cleanup was needed.\n\n## Adventure map prompt\n\nOriginal orthographic top-down fantasy map, broad readable path, exploration branches, boss clearing, soft hand-painted textures, clear collision boundaries, no lettering, no brand elements.\n`);
  console.log(JSON.stringify({petForms:catalog.pets.length*4,spriteAtlases:spriteSheets.length,rooms:catalog.rooms.length,maps:catalog.maps.length,collectibles:catalog.wearables.length+catalog.furniture.length,enemies:12,bosses:10,skillEffects:16,root},null,2));
}

await main();
