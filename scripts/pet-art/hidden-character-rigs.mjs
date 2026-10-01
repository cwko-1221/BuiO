/** Editable vector character models. Every animation phase shares the same geometry,
 * palette and skeleton; only joints, cloth follow-through and eyelids change. */
export const HIDDEN_CHARACTERS = [
  { id: 'pikachu', label: 'Pikachu', zh: '比卡超', color: '#f6cd3e' },
  { id: 'dragon-ball-frieza', label: 'Frieza', zh: '弗利沙', color: '#9861d8' },
  { id: 'one-piece-luffy', label: 'Monkey D. Luffy', zh: '路飛', color: '#e2443e' },
  { id: 'spy-family-anya', label: 'Anya Forger', zh: '安妮亞', color: '#ef9fb2' },
  { id: 'one-punch-saitama', label: 'Saitama', zh: '埼玉', color: '#eccb39' },
  { id: 'naruto-uzumaki', label: 'Naruto Uzumaki', zh: '漩渦鳴人', color: '#f39331' },
];

const OUTLINE = '#272734';
const n = (v) => Number(v.toFixed(3));
const ellipse = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (d, color = OUTLINE, width = 3) => path(d, 'none', `stroke="${color}" stroke-width="${width}"`);
const rotate = (angle, x, y, content) => `<g transform="rotate(${n(angle)} ${x} ${y})">${content}</g>`;
const gradient = (id, light, main, shade) => `<radialGradient id="${id}" cx=".32" cy=".18" r=".96"><stop stop-color="${light}"/><stop offset=".44" stop-color="${main}"/><stop offset="1" stop-color="${shade}"/></radialGradient>`;
const colors = {
  'dragon-ball-frieza': { skin: 'white', shirt: 'white', trousers: 'white', shoes: 'white', gloves: 'white' },
  'one-piece-luffy': { skin: 'skin', shirt: 'red', trousers: 'blue', shoes: 'brown', gloves: 'skin' },
  'spy-family-anya': { skin: 'skin', shirt: 'uniform', trousers: 'skin', shoes: 'brown', gloves: 'skin' },
  'one-punch-saitama': { skin: 'skin', shirt: 'yellow', trousers: 'yellow', shoes: 'red', gloves: 'red' },
  'naruto-uzumaki': { skin: 'skin', shirt: 'orange', trousers: 'orange', shoes: 'black', gloves: 'skin' },
};
const paint = (name) => `url(#${name})`;
const defs = () => `<defs>
  ${gradient('yellow', '#fff39b', '#f8d347', '#d89822')}
  ${gradient('skin', '#ffead6', '#f9cfae', '#cd8e70')}
  ${gradient('white', '#ffffff', '#eceefa', '#a6adc4')}
  ${gradient('purple', '#e7b9ff', '#9b59d5', '#562776')}
  ${gradient('pink', '#ffd7e4', '#ee9bb8', '#c25c83')}
  ${gradient('red', '#ff9c80', '#e74745', '#9b2436')}
  ${gradient('orange', '#ffca77', '#f28b30', '#b6571e')}
  ${gradient('blue', '#89c5ff', '#397cac', '#254b75')}
  ${gradient('brown', '#d5a675', '#865a41', '#4a3630')}
  ${gradient('black', '#677085', '#303543', '#171b27')}
  ${gradient('uniform', '#6c6667', '#38323f', '#1a1823')}
  ${gradient('straw', '#fff0ae', '#dfb862', '#ac7e37')}
  ${gradient('blond', '#fffaaa', '#f4d34c', '#c99524')}
  ${gradient('green', '#c4f788', '#67ab64', '#285c50')}
  ${gradient('iris-blue', '#a9edff', '#53a6d5', '#2c597c')}
</defs>`;

function expression(action, phase) {
  if (action === 'sleep') return 0;
  if (action === 'happy') return -.5;
  if (action === 'surprised') return 1.3;
  if (action === 'idle') return [1, 1, 1, .42, 0, .42, 1, 1][phase];
  return 1;
}

function eye(x, y, openness, iris, rx = 13) {
  if (openness <= 0) return line(`M${x - rx} ${y - 1} Q${x} ${y + (openness < 0 ? -8 : 8)} ${x + rx} ${y - 1}`, OUTLINE, 4);
  const ry = 17 * openness;
  return ellipse(x, y, rx, ry, '#fff', 'stroke-width="3"')
    + ellipse(x + 1, y + Math.min(2, ry * .15), rx * .52, ry * .82, iris)
    + ellipse(x + 1, y + 1, rx * .28, ry * .65, '#20202a', 'stroke="none"')
    + ellipse(x - 2, y - ry * .38, 2.8, Math.min(4, ry * .22), '#fff', 'stroke="none"');
}

function humanFace(id, facing, action, phase, child) {
  const style = colors[id];
  const back = facing === 'back', side = facing === 'right';
  const cy = child ? 164 : 153, rx = side ? 65 : child ? 81 : 77, ry = child ? 79 : 83;
  const skin = paint(style.skin), blink = expression(action, phase);
  let result = ellipse(256, cy, rx, ry, skin);
  if (side && !back) result += path(`M311 ${cy-8} Q325 ${cy-5} 330 ${cy+3} L315 ${cy+10}`, skin);
  result += side ? ellipse(208, cy + 8, 10, 16, skin)
    : ellipse(178, cy + 8, 11, 16, skin) + ellipse(334, cy + 8, 11, 16, skin);
  if (back) return result;
  const iris = id === 'spy-family-anya' ? paint('green') : id === 'naruto-uzumaki' ? paint('iris-blue') : '#39333a';
  const xs = side ? [291] : [227, 285];
  if (id === 'dragon-ball-frieza') {
    for (const x of xs) result += blink <= 0 ? line(`M${x-15} ${cy+5} q14 9 29-3`,OUTLINE,4) : path(`M${x-15} ${cy+3} L${x+14} ${cy-2} L${x+8} ${cy+14} L${x-7} ${cy+14} Z`, '#fff')
      + ellipse(x+1, cy+8, 4, 7 * Math.max(.12, blink), '#ad2849', 'stroke="none"')
      + line(`M${x-14} ${cy+4} L${x+13} ${cy-2}`, OUTLINE, 4);
    result += line(`M${side?282:215} ${cy+27} l7 16 M${side?303:296} ${cy+25} l-6 17`, '#8a8098', 2);
  } else {
    for (const x of xs) result += eye(x, cy + 9, blink, iris, id === 'one-punch-saitama' ? 11 : child ? 16 : 13);
    for (const x of xs) result += line(`M${x-11} ${cy-17} Q${x} ${cy-22} ${x+11} ${cy-17}`, id === 'naruto-uzumaki' ? '#967122' : '#59413d', 3);
  }
  if (!side) result += line(`M256 ${cy+24} q-4 8 3 9`, '#b28778', 2);
  if (action === 'surprised') result += ellipse(side ? 304 : 256, cy + 53, 9, 13, '#512b38');
  else if (action === 'happy' || action === 'eat') result += path(`M${side?284:237} ${cy+49} q18 3 37 0 q-6 24 -19 25 q-13-1-18-25`, '#713441') + line(`M${side?287:240} ${cy+52} h29`, '#fff', 5);
  else result += line(`M${side?295:243} ${cy+52} q12 7 24 0`, '#6f4547', 3);
  if (id === 'one-piece-luffy' && !side) result += line(`M213 ${cy+31} h20 M218 ${cy+27} v8 M227 ${cy+27} v8`, '#76584e', 2);
  if (id === 'naruto-uzumaki') {
    for (const y of [cy+30,cy+38,cy+46]) result += side ? line(`M275 ${y} l-14 3`, '#895a47', 2)
      : line(`M194 ${y} l18 5 M300 ${y+5} l18-5`, '#895a47', 2);
  }
  return result;
}

function headwear(id, facing, child) {
  const side = facing === 'right', back = facing === 'back';
  if (id === 'one-punch-saitama') return ellipse(228, 102, 17, 8, '#fff', 'stroke="none" opacity=".2"');
  if (id === 'dragon-ball-frieza') return path('M197 118 Q195 66 254 64 Q313 64 315 118 Q281 144 256 143 Q229 144 197 118Z', paint('purple'))
    + line('M195 124 Q188 162 198 190 M317 124 Q325 162 314 190', '#aaa4be', 3)
    + (side ? ellipse(210,167,6,10,'#6c637c','stroke-width="2"') : '');
  if (id === 'spy-family-anya') {
    const hair = path('M173 200 Q154 122 185 96 Q206 68 255 73 Q311 68 333 111 Q351 150 337 213 L313 231 L312 144 Q292 153 278 115 L264 142 L247 113 Q222 148 205 137 L204 227Z', paint('pink'));
    const ornaments = (side ? [182] : [182,330]).map(x => path(`M${x-13} 112 L${x-17} 75 Q${x} 62 ${x+17} 75 L${x+13} 112Z`, paint('black')) + line(`M${x-15} 83 Q${x} 73 ${x+15} 83`, '#e5c669', 4)).join('');
    return back ? path('M172 212 Q154 107 207 80 Q256 56 307 83 Q354 110 338 215 L315 235 L193 235Z',paint('pink')) + line('M196 108 Q187 153 195 209 M227 99 Q217 160 227 228 M281 99 Q292 165 279 228 M312 109 Q325 157 314 209','#d57b9d',2) + ornaments : hair + ornaments;
  }
  if (id === 'naruto-uzumaki') {
    const hair = path('M178 143 L158 119 L182 116 L165 90 L194 96 L187 65 L211 77 L218 47 L237 69 L251 38 L263 68 L290 47 L289 80 L318 66 L310 99 L340 89 L328 120 L348 119 L331 147 Q312 111 299 119 Q256 97 213 119 Q192 113 178 143Z',paint('blond'));
    const band = path('M180 113 Q256 97 332 113 L329 137 Q255 122 183 137Z',paint('black'));
    return hair + band + (back ? path('M218 124 L240 147 L223 178 L215 143 L195 164 L208 131Z',paint('black'))
      : path('M211 112 Q256 104 301 112 L299 132 Q257 123 214 132Z',paint('white'))
        + line(side ? 'M265 117 q12-11 15 1 q-3 14-14 4 q-5-8 1-9 M275 111 l9-4 M259 127 l-5 6' : 'M249 115 q12-9 16 2 q3 14-11 12 q-11-2-6-12 q5-5 9 1 M260 112 l12-4 M248 129 l-7 7', '#626571', 2));
  }
  const hair = path('M178 144 L165 119 L184 121 L174 99 L196 110 L195 88 L216 102 L226 82 L244 98 L259 82 L276 103 L297 89 L302 111 L326 103 L321 130 L339 130 L332 156 L312 138 L301 128 L280 141 L266 124 L247 140 L231 126 L210 144 L199 127Z', paint('black'));
  if (id !== 'one-piece-luffy') return hair;
  const hat = path('M181 96 Q181 51 255 48 Q330 51 331 96 L340 111 Q257 128 171 111Z',paint('straw'))
    + path('M181 94 Q256 109 331 94 L331 108 Q256 124 181 108Z',paint('red'))
    + path('M145 115 Q164 96 256 102 Q350 95 369 115 Q368 138 256 139 Q144 139 145 115Z',paint('straw'))
    + line('M160 118 Q256 101 352 118 M169 127 Q256 115 343 127','#b88c44',2)
    + [195,211,229,249,268,287,306,321].map(x=>line(`M${x} 78 l3 14`,'#c49b54',2)).join('');
  return hair + hat;
}

function humanoid(id, facing, action, phase) {
  if (action === 'sleep') return sleepingHuman(id);
  if (action === 'sit') return sittingHuman(id);
  const style = colors[id], child = id === 'spy-family-anya', side = facing === 'right', back = facing === 'back';
  const walk = action === 'walk';
  const theta = phase * Math.PI / 4, stride = walk ? Math.cos(theta) : 0;
  const breath = action === 'idle' ? [0,.8,.4,.15,-.1,-.25,-.5,-.2][phase] : 0;
  const sit = action === 'sit', hipY = child ? 399 : 363;
  const floor = 472, bodyW = child ? 118 : 101;
  const bodyTop = child ? 251 : 241, bodyBottom = sit ? hipY + 17 : hipY;
  let result = ellipse(256,child?245:235,17,27,paint(style.skin));
  if (id === 'dragon-ball-frieza') result += path(`M${side?218:283} 350 C${side?110:389} 389 ${side?79:423} 420 ${side?117:394} 423 C${side?142:401} 447 ${side?178:361} 425 ${side?165:342} 412`, 'none', `stroke="#77788d" stroke-width="21"`)
    + path(`M${side?218:283} 350 C${side?110:389} 389 ${side?79:423} 420 ${side?117:394} 423 C${side?142:401} 447 ${side?178:361} 425 ${side?165:342} 412`, 'none', `stroke="#f6f4fb" stroke-width="14"`);
  if (id === 'one-punch-saitama' && !back) result += side ? path(`M247 247 Q208 272 185 ${430+stride*3} Q217 441 257 422 L272 249Z`,paint('white')) + line('M242 272 Q220 336 211 418','#c0c4d5',3)
    : path(`M211 247 Q184 282 175 ${430+stride*3} Q209 437 252 422 Q300 442 337 ${426-stride*3} Q330 283 301 247Z`,paint('white')) + line('M217 262 Q207 334 204 414 M294 268 Q307 340 311 418','#c0c4d5',3);
  const limbs = [-1,1].map(sign => {
    const s = stride * sign, swing = side ? s * 30 : sign * 23 + s * 3;
    const footX = 256 + swing, lift = walk ? Math.max(0, Math.sin(theta) * sign) * (side ? 19 : 13) + (side ? 0 : (1-s)*3) : 0;
    const fy = floor - lift, hx = 256 + (side ? sign * 6 : sign * 22);
    const ky = (hipY + fy) / 2 - lift * .18, kx = (hx+footX)/2 + (side ? lift * .6 : sign * lift * .13);
    const shoe = style.shoes, leg = style.trousers;
    const legWidth = child ? 10 : 13;
    const d = `M${hx-legWidth} ${hipY-9} Q${kx-legWidth} ${ky} ${footX-11} ${fy-14} L${footX+11} ${fy-14} Q${kx+legWidth} ${ky} ${hx+legWidth} ${hipY-9}Z`;
    let part = path(d, paint(leg));
    if (id === 'one-piece-luffy') part += path(`M${hx-15} ${hipY-12} Q${kx-16} ${hipY+30} ${kx-15} ${hipY+48} L${kx+15} ${hipY+48} Q${kx+16} ${hipY+31} ${hx+15} ${hipY-12}Z`,paint('blue')) + line(`M${kx-13} ${hipY+45} h26`,'#f4eadd',5);
    if (child) part += path(`M${footX-11} ${fy-35} L${footX+11} ${fy-35} L${footX+12} ${fy-12} L${footX-12} ${fy-12}Z`,paint('white'));
    if (id === 'naruto-uzumaki' && sign === 1) part += line(`M${hx-12} ${hipY+22} h26 M${hx-12} ${hipY+29} h26`,'#eceef5',5);
    part += path(`M${footX-13} ${fy-15} Q${footX-27} ${fy-2} ${footX-23} ${fy+4} Q${footX-3} ${fy+10} ${footX+24} ${fy+4} Q${footX+28} ${fy-4} ${footX+12} ${fy-15}Z`,paint(shoe));
    if (id === 'one-piece-luffy' || id === 'naruto-uzumaki') part += ellipse(footX+5,fy-4,13,6,paint('skin'),'stroke-width="2"') + line(`M${footX-8} ${fy-7} l17 6`, id === 'naruto-uzumaki' ? '#303747' : '#72513b',5);
    else part += line(`M${footX-20} ${fy+3} Q${footX} ${fy+7} ${footX+21} ${fy+2}`,'#4b4250',2);
    return { sign, s, part };
  });
  if (side) limbs.sort((a,b)=>a.sign-b.sign);
  result += limbs.map(l=>`<g ${side && l.sign<0 ? 'opacity=".88"' : ''}>${l.part}</g>`).join('');
  if (side) result += '<g transform="translate(256 0) scale(.66 1) translate(-256 0)">';
  result += path(`M${256-bodyW/2} ${bodyTop+12} Q256 ${bodyTop-13} ${256+bodyW/2} ${bodyTop+12} L${256+bodyW/2+breath} ${bodyBottom} Q256 ${bodyBottom+13} ${256-bodyW/2-breath} ${bodyBottom}Z`, paint(style.shirt));
  if (id === 'one-piece-luffy') {
    result += (back ? '' : path('M242 242 L256 261 L270 242 L271 339 L244 339Z',paint('skin')))
      + path('M205 345 Q256 355 307 345 L307 368 Q255 377 205 367Z',paint('yellow'));
    if (!back) result += [274,301,327].map(y=>ellipse(234,y,3.8,3.8,'#f6c765','stroke-width="1.5"')).join('');
  } else if (id === 'spy-family-anya') {
    result += path('M210 313 L191 412 Q255 441 322 412 L303 313Z',paint('uniform'))
      + line('M198 409 Q256 428 316 409','#ead28b',5)
      + (back ? '' : path('M221 248 L253 264 L233 282 L215 267Z M291 248 L260 264 L278 282 L299 267Z',paint('white'))
      + path('M254 269 L237 261 L234 279 L253 279 L260 291 L265 279 L281 279 L278 261 L262 269Z',paint('red')));
    if (!back) result += path('M279 299 L298 299 L296 318 L289 326 L281 318Z','#e0bc61','stroke-width="2"') + line('M287 303 v16 M282 308 h13','#fff1b1',2);
  } else if (id === 'one-punch-saitama') {
    result += path('M205 344 Q256 352 307 344 L307 361 Q256 372 205 361Z',paint('black')) + (back ? '' : ellipse(256,355,13,11,paint('yellow')));
    if (!back) result += ellipse(215,250,8,9,paint('white'))+ellipse(297,250,8,9,paint('white'))+line('M257 257 v73','#a07824',3);
  } else if (id === 'naruto-uzumaki') {
    result += path('M207 248 Q256 226 305 248 L305 285 Q256 272 207 285Z',paint('black')) + line('M255 251 v94','#dfdfdf',3)
      + (back ? ellipse(256,305,18,17,paint('red')) + line('M250 303 q16-12 20 4 q0 15-17 10 q-12-4-4-10','#4e222e',3) : line('M244 264 v14','#f1f2f6',2));
  } else if (id === 'dragon-ball-frieza') {
    result += (back ? line('M256 249 v71 M224 301 Q256 325 288 301','#9b93b2',2) : ellipse(256,279,33,24,paint('purple')) + line('M225 315 Q256 330 287 315 M225 328 Q256 340 287 328 M229 341 Q256 350 283 341','#9b93b2',2));
  }
  if (side) result += '</g>';
  if (id === 'one-punch-saitama' && back) result += path(`M210 245 Q188 284 177 ${430+stride*3} Q257 451 335 ${426-stride*3} Q326 279 302 245Z`,paint('white'))
    + line('M219 264 Q208 335 205 422 M257 269 v166 M293 265 Q307 342 308 420','#c0c4d5',3);
  for (const sign of [-1,1]) {
    const shoulderX = 256 + sign * (side ? 5 : bodyW/2-2), shoulderY = bodyTop + 16;
    let handX = 256 + sign * (side ? 3 : bodyW/2+17), handY = child ? 340 : 344;
    if (walk) { handY += sign * stride * 12; handX += side ? -sign * stride * 28 : sign * Math.sin(theta)*3; }
    if (action === 'happy') { handX += sign*21; handY = 236; }
    if (action === 'eat') { handX = 256+sign*21; handY = 278; }
    if (action === 'surprised') { handX += sign*12; handY = 313; }
    const elbowX = shoulderX + sign * 15, elbowY = (shoulderY+handY)/2;
    result += path(`M${shoulderX-10} ${shoulderY-6} Q${elbowX-12} ${elbowY} ${handX-10} ${handY-8} L${handX+10} ${handY-8} Q${elbowX+12} ${elbowY} ${shoulderX+10} ${shoulderY-6}Z`,paint(id==='one-piece-luffy'? 'skin' : style.shirt));
    result += ellipse(handX,handY,13,17,paint(style.gloves)) + line(`M${handX-5} ${handY+6} v6 M${handX+2} ${handY+6} v7`, '#705860',1.8);
    if (id === 'dragon-ball-frieza') result += ellipse(shoulderX,shoulderY,13,15,paint('purple'));
  }
  result += humanFace(id,facing,action,phase,child) + headwear(id,facing,child);
  if (action === 'eat') result += ellipse(256,274,14,17,paint('red'))+path('M255 258 Q251 247 263 248 L259 260Z',paint('green'),'stroke-width="2"');
  return result;
}

function sittingHuman(id) {
  const style = colors[id], child = id === 'spy-family-anya';
  let result = id === 'one-punch-saitama' ? path('M203 311 Q171 371 177 458 Q256 479 336 455 Q337 367 310 311Z',paint('white')) : '';
  if (id === 'dragon-ball-frieza') result += line('M298 402 Q424 454 370 469 Q337 478 325 455','#f5f3fb',18);
  result += path('M209 309 Q256 290 303 309 L313 407 Q257 438 201 407Z',paint(style.shirt));
  for (const sign of [-1,1]) {
    result += path(`M256 399 Q${256+sign*62} 393 ${256+sign*69} 427 Q${256+sign*64} 452 ${256+sign*30} 455 L256 434Z`,paint(style.trousers));
    result += ellipse(256+sign*39,462,30,14,paint(style.shoes));
    result += path(`M${256+sign*42} 322 Q${256+sign*74} 358 ${256+sign*43} 413 L${256+sign*24} 407 Q${256+sign*45} 363 ${256+sign*24} 326Z`,paint(id==='one-piece-luffy'?'skin':style.shirt));
    result += ellipse(256+sign*34,416,13,17,paint(style.gloves));
  }
  if (id==='one-piece-luffy') result += path('M243 305 L256 322 L270 305 L268 395 L244 395Z',paint('skin')) + line('M209 405 Q256 420 303 405','#efcb40',13);
  if (id==='spy-family-anya') result += path('M213 315 L256 333 L300 315 L283 345 L228 345Z',paint('white')) + path('M256 335 L238 326 L239 347 L256 343 L274 347 L276 326Z',paint('red')) + line('M205 405 Q256 424 309 405','#e5c97e',4);
  if (id==='dragon-ball-frieza') result += ellipse(256,347,30,21,paint('purple'));
  if (id==='one-punch-saitama') result += line('M210 402 Q256 413 302 402','#303543',13) + ellipse(256,410,12,10,paint('yellow'));
  if (id==='naruto-uzumaki') result += path('M211 312 Q256 296 301 312 L301 341 Q256 327 211 341Z',paint('black')) + line('M256 320 v80','#f4f4f4',3);
  result += `<g transform="translate(0 62)">${humanFace(id,'front','idle',0,child)+headwear(id,'front',child)}</g>`;
  return result;
}

function sleepingHuman(id) {
  const style = colors[id], child = id === 'spy-family-anya';
  let result = id === 'one-punch-saitama' ? path('M145 354 Q240 323 359 367 L406 454 L157 462Z',paint('white')) : '';
  if (id === 'dragon-ball-frieza') result += line('M303 392 C412 385 440 436 382 461 Q342 476 322 445','#eeeaf7',19);
  // Curled torso and folded knees. Head remains the same size as the standing model.
  result += path('M190 350 Q251 317 304 363 Q331 383 301 410 L266 438 Q201 453 174 413Z',paint(style.shirt));
  result += path('M277 394 Q340 348 361 389 Q376 415 337 439 L295 453 L259 430Z',paint(style.trousers));
  result += path('M302 438 Q339 424 370 444 Q384 457 370 466 L313 466 Q297 458 302 438Z',paint(style.shoes));
  if (id === 'spy-family-anya') result += line('M191 418 Q228 436 272 427','#e4c67a',5);
  if (id === 'naruto-uzumaki') result += path('M187 352 Q221 327 249 344 L259 374 L209 393Z',paint('black'));
  if (id === 'dragon-ball-frieza') result += ellipse(237,374,27,18,paint('purple'));
  const head = humanFace(id,'front','sleep',0,child)+headwear(id,'front',child);
  result += `<g transform="translate(-93 225) rotate(-13 256 153)">${head}</g>`;
  result += path('M235 386 Q206 401 170 427 L168 445 Q208 451 245 415Z',paint(style.gloves)) + ellipse(164,439,18,12,paint(style.gloves));
  return result;
}

function pikachu(facing, action, phase) {
  if (action === 'sleep') return sleepingPikachu();
  const side = facing === 'right', back = facing === 'back', walk = action === 'walk';
  const theta = phase*Math.PI/4, stride = walk ? Math.cos(theta) : 0;
  const breath = action==='idle' ? [0,.9,.4,.15,-.1,-.25,-.5,-.2][phase] : 0;
  const blink=expression(action,phase), earMove=walk?Math.sin(theta)*1.3:0;
  let result = rotate(walk ? Math.sin(theta-.4)*2 : 0, side?185:293,369,
    path(side ? 'M188 376 L151 363 L134 324 L97 337 L55 264 L115 236 L133 278 L164 270 L177 327 L204 340Z'
      : 'M291 379 L329 361 L330 320 L363 329 L419 263 L465 293 L426 341 L399 327 L377 381 L318 408Z',paint('yellow'))
    + path(side?'M188 376 L151 363 L143 346 L180 334 L204 340Z':'M291 379 L329 361 L329 383 L318 408Z',paint('brown')));
  for(const sign of [-1,1]) {
    const lift=walk?Math.max(0,Math.sin(theta)*sign)*(side?18:12)+(side?0:(1-stride*sign)*3):0;
    const x=256+(side?stride*sign*30:sign*39+stride*sign*3), y=466-lift;
    const hipX=256+sign*(side?5:29);
    result+=path(`M${hipX-13} 393 Q${x-18} 426 ${x-17} ${y-6} L${x+15} ${y-6} Q${x+20} 424 ${hipX+13} 393Z`,paint('yellow'))
      +ellipse(x,y,side?29:27,12,paint('yellow'))+line(`M${x+7} ${y-5} l2 7 M${x+15} ${y-3} l2 5`, '#826128',2);
  }
  if (side) result += '<g transform="translate(256 0) scale(.78 1) translate(-256 0)">';
  result+=path(`M194 283 Q256 ${269-breath} 318 284 Q341 337 320 420 Q257 454 192 420 Q170 336 194 283Z`,paint('yellow'));
  if(back) result+=path('M201 307 Q257 321 309 307 L309 327 Q256 341 201 327Z M204 348 Q257 361 307 348 L306 367 Q256 381 204 367Z',paint('brown'),'stroke-width="3"');
  for(const sign of [-1,1]) {
    let x=256+sign*(side?12:69),y=355+(walk?sign*stride*9:breath*.35);
    if (walk && side) x -= sign*stride*23;
    if(action==='happy'){x+=sign*11;y=269;}
    if(action==='eat'){x=256+sign*24;y=313;}
    if(action==='surprised'){x+=sign*10;y=322;}
    if(side) {
      const shoulder=256+sign*5,elbow=(shoulder+x)/2,midY=(304+y)/2;
      result+=path(`M${shoulder-7} 303 Q${elbow-9} ${midY} ${x-8} ${y-4} Q${x-11} ${y+11} ${x+8} ${y+8} Q${elbow+10} ${midY} ${shoulder+7} 303Z`,paint('yellow'));
    } else result+=path(`M${256+sign*57} 294 Q${x+sign*16} 320 ${x} ${y+10} Q${x-sign*19} ${y+19} ${256+sign*47} 314Z`,paint('yellow'));
  }
  if (side) result += '</g>';
  const ears=[[-1,-earMove],[1,earMove]].map(([sign,angle])=>rotate(angle,256+sign*59,166,
    path(sign<0?'M197 170 Q137 131 143 48 Q157 31 168 56 L227 153Z':'M285 158 L343 51 Q356 32 370 43 Q374 120 315 173Z',paint('yellow'))
    +path(sign<0?'M143 48 Q157 31 168 56 L180 80 Q156 87 146 75Z':'M343 51 Q356 32 370 43 L368 74 Q354 86 331 75Z',paint('black')))).join('');
  const headStart = result.length;
  result+=ears+ellipse(256,230,side?78:94,82,paint('yellow'));
  if(!back) {
    const eyeXs=side?[291]:[224,282];
    for(const x of eyeXs) {
      if(blink<=0) result+=line(`M${x-13} 223 Q${x} ${blink<0?212:231} ${x+13} 223`,OUTLINE,4);
      else result+=ellipse(x,222,12,17*blink,paint('black'))+ellipse(x-4,216,3.9,Math.min(5,5*blink),'#fff','stroke="none"');
    }
    result+=ellipse(side?296:193,253,17,15,paint('red'),'stroke-width="2.5"');
    if(!side) result+=ellipse(319,253,17,15,paint('red'),'stroke-width="2.5"');
    const noseX=side?333:256;
    result+=path(`M${noseX-5} 240 Q${noseX} 236 ${noseX+5} 240 L${noseX} 246Z`,'#272734','stroke-width="1.5"');
    result+=action==='surprised'?ellipse(side?315:256,269,8,11,'#71353f'):
      action==='happy'||action==='eat'?path(side?'M299 267 q16 1 23-2 q-3 20-13 20 q-7-1-10-18':'M237 267 q19 7 38 0 q-5 23-19 23 q-14 0-19-23','#71353f'):
      line(side?'M304 269 q9 6 18-1':'M237 266 q9 9 19 0 q10 9 19 0','#6b4835',3);
  }
  if(action==='eat') result+=ellipse(256,311,17,18,paint('red'))+path('M253 294 Q256 282 268 283 L260 296Z',paint('green'),'stroke-width="2"');
  if(action==='sit') return path('M306 414 L339 397 L346 355 L376 367 L416 308 L457 330 L424 375 L397 362 L375 426 L318 443Z',paint('yellow'))
    + ellipse(256,403,74,57,paint('yellow'))
    + ellipse(211,470,31,13,paint('yellow')) + ellipse(301,470,31,13,paint('yellow'))
    + ellipse(205,410,14,29,paint('yellow')) + ellipse(307,410,14,29,paint('yellow'))
    + `<g transform="translate(0 60)">${result.slice(headStart)}</g>`;
  return result;
}

function sleepingPikachu() {
  return path('M309 383 L350 358 L370 308 L420 333 L384 375 L365 365 L339 421Z',paint('yellow'))
    + ellipse(275,409,93,56,paint('yellow'))
    + ellipse(316,455,31,14,paint('yellow'))
    + path('M185 352 Q130 329 106 300 Q99 281 118 283 Q157 296 208 334Z',paint('yellow'))
    + path('M106 300 Q99 281 118 283 L139 292 L127 313Z',paint('black'))
    + path('M208 338 Q195 281 209 256 Q222 242 231 265 L239 341Z',paint('yellow'))
    + path('M209 256 Q222 242 231 265 L234 284 Q218 291 206 277Z',paint('black'))
    + ellipse(184,396,86,65,paint('yellow'))
    + line('M148 383 Q160 392 171 380 M202 380 Q214 391 227 380',OUTLINE,4)
    + ellipse(124,413,16,14,paint('red')) + ellipse(240,410,16,14,paint('red'))
    + path('M180 403 L189 403 L185 409Z',OUTLINE)
    + line('M170 423 q8 8 15 0 q8 8 17 0','#6b4835',3)
    + ellipse(228,447,32,16,paint('yellow'));
}

export function renderHiddenCharacter(id, facing, action, phase = 0) {
  if (!HIDDEN_CHARACTERS.some(character=>character.id===id)) throw new Error(`Unknown character ${id}`);
  const art=id==='pikachu'?pikachu(facing,action,phase):humanoid(id,facing,action,phase);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs()}<g stroke="${OUTLINE}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round">${art}</g></svg>`;
}
