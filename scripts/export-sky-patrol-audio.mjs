import fs from 'node:fs/promises';
import path from 'node:path';
import {SKY_CUES,skySound} from '../pet-app/lib/sky-sound.mjs';
const folder=path.resolve('artifacts/sky-patrol-v2/audio');await fs.mkdir(folder,{recursive:true});
function wav(samples){const b=Buffer.alloc(44+samples.length*2),rate=22050;b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);return b;}
let length=0;const sounds=[];for(const cue of SKY_CUES){const samples=skySound(cue,22050);await fs.writeFile(path.join(folder,cue+'.wav'),wav(samples));sounds.push(samples);length+=samples.length+Math.round(22050*.18);}
const reel=new Float32Array(length);let at=0;for(const sound of sounds){reel.set(sound,at);at+=sound.length+Math.round(22050*.18);}await fs.writeFile(path.join(folder,'sound-reel.wav'),wav(reel));console.log(JSON.stringify({originalCues:SKY_CUES.length,seconds:length/22050,folder}));
