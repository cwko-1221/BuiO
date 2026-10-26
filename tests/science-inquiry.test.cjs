'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PGlite } = require('@electric-sql/pglite');
const run = promisify(execFile);
const teacher = { studentId:'T001',role:'teacher' };
const student = { studentId:'S001',role:'student' };
const other = { studentId:'S002',role:'student' };
const root = path.resolve(__dirname,'..');

async function fixture(t,mode) {
  const data = { scienceInquiryVideos:[],scienceInquiryLikes:[] };
  let db;
  let transaction = Promise.resolve();
  if (mode === 'postgres') {
    db = new PGlite();
    t.after(()=>db.close());
    await db.exec(`CREATE TABLE Users(StudentID VARCHAR(20) PRIMARY KEY);
      INSERT INTO Users VALUES('S001'),('S002'),('T001'); CREATE ROLE anon; CREATE ROLE authenticated;`);
  }
  const query = async(target,text,values=[]) => values.length ? target.query(text,values) : (await target.exec(text)).at(-1);
  const database = { getPool:()=>({query:(text,values)=>query(db,text,values)}),withTransaction:fn=>{
    const work=transaction.then(()=>db.transaction(tx=>fn({query:(text,values)=>query(tx,text,values)})));
    transaction=work.catch(()=>{});return work;
  } };
  const filename=path.join(root,'science-inquiry-app/repository.js');
  const native=createRequire(filename),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,__dirname:path.dirname(filename),
    require:id=>id==='../config'?{db:{mode}}:id==='../db/jsonStore'?{load:()=>data,save:()=>{}}:id==='../math-app/db/database'?database:native(id),
    console,Date,structuredClone,process,Buffer},{filename});
  return { repo:module.exports,data,db };
}
const input = (overrides={}) => {const id=randomUUID();return {id,authorName:'科學同學',title:'杯外的水珠',description:'水是從哪裡來的？',kind:'question',
  storageKey:`${id}/video.mp4`,posterKey:`${id}/poster.jpg`,duration:2,originalBytes:1000,videoBytes:500,width:640,height:360,...overrides};};

for (const mode of ['json','postgres']) {
  test(`${mode}: student upload text is optional, including missing and whitespace-only fields`,async t=>{
    const {repo}=await fixture(t,mode);
    for(const fields of [{title:undefined,description:undefined},{title:null,description:null},{title:'  ',description:'\n\t'}]) {
      const item=await repo.create(student,input(fields));
      assert.equal(item.title,'');assert.equal(item.description,'');assert.equal(item.status,'pending');
    }
    const item=await repo.create(student,input({title:'  留心觀察  ',description:'  我想知道原因。  '}));
    assert.equal(item.title,'留心觀察');assert.equal(item.description,'我想知道原因。');
    assert.equal((await repo.list(student,{scope:'mine'})).items.length,4);
  });
  test(`${mode}: moderation, private media, atomic likes, stale reviews and pagination`,async t=>{
    const {repo,db}=await fixture(t,mode);
    await assert.rejects(repo.create(teacher,input()),error=>error.status===403);
    await assert.rejects(repo.create(student,input({title:'字'.repeat(101)})),error=>error.status===400);
    await assert.rejects(repo.create(student,input({description:'字'.repeat(2001)})),error=>error.status===400);
    await assert.rejects(repo.create(student,input({kind:'invalid'})),error=>error.status===400);
    const pending=await repo.create(student,input({status:'published'}));
    assert.equal(pending.status,'pending');
    assert.equal((await repo.list(other)).items.length,0);
    assert.equal((await repo.list(student,{scope:'mine'})).items.length,1);
    assert.equal((await repo.list(teacher,{scope:'review'})).items.length,1);
    assert.ok(await repo.accessible(pending.id,student));
    assert.ok(await repo.accessible(pending.id,teacher));
    await assert.rejects(repo.accessible(pending.id,other),error=>error.status===404);
    await assert.rejects(repo.accessible('../private',teacher),error=>error.status===404);
    await assert.rejects(repo.list(student,{scope:'review'}),error=>error.status===403);
    await assert.rejects(repo.list(student,{page:'1 OR 1=1'}),error=>error.status===400);
    await assert.rejects(repo.like(pending.id,other,true),error=>error.status===404);
    await assert.rejects(repo.review(pending.id,student,{status:'published',revision:0}),error=>error.status===403);
    await assert.rejects(repo.review(pending.id,teacher,{status:'rejected',revision:0}),error=>error.status===400);
    const published=await repo.review(pending.id,teacher,{status:'published',revision:0,note:'很好奇的觀察'});
    assert.equal(published.status,'published');assert.equal(published.revision,1);
    assert.ok((await repo.accessible(pending.id,other)).publishedAt);
    const feed=(await repo.list(other)).items[0];
    assert.equal(feed.reviewNote,undefined);assert.equal(feed.storageKey,undefined);assert.equal(feed.authorId,undefined);
    await assert.rejects(repo.review(pending.id,teacher,{status:'rejected',revision:0,note:'舊的決定'}),error=>error.status===409);
    await assert.rejects(repo.like(pending.id,teacher,true),error=>error.status===403);
    await assert.rejects(repo.like(pending.id,other,'true'),error=>error.status===400);
    await Promise.all(Array.from({length:12},()=>repo.like(pending.id,other,true)));
    assert.equal((await repo.list(other)).items[0].likeCount,1);
    assert.equal((await repo.list(other)).items[0].liked,true);
    await repo.like(pending.id,student,true);assert.equal((await repo.list(student)).items[0].likeCount,2);
    await repo.like(pending.id,other,false);await repo.like(pending.id,other,false);
    assert.equal((await repo.list(other)).items[0].likeCount,1);
    await repo.review(pending.id,teacher,{status:'rejected',revision:1,note:'請遮蓋個人資料再拍攝。'});
    assert.equal((await repo.list(other)).items.length,0);
    await assert.rejects(repo.accessible(pending.id,other),error=>error.status===404);
    await assert.rejects(repo.like(pending.id,other,true),error=>error.status===404);
    assert.equal((await repo.list(student,{scope:'mine'})).items[0].reviewNote,'請遮蓋個人資料再拍攝。');
    await repo.review(pending.id,teacher,{status:'pending',revision:2,note:''});
    assert.equal((await repo.list(teacher,{scope:'review'})).items.length,1);
    for(let i=0;i<13;i++)await repo.create(student,input({title:`發現 ${i}`}));
    const first=await repo.list(student,{scope:'mine'}),second=await repo.list(student,{scope:'mine',page:2});
    assert.equal(first.items.length,12);assert.equal(first.hasMore,true);assert.equal(second.items.length,2);assert.equal(second.hasMore,false);
    assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,14);
    if(db){
      assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='scienceinquiryvideos'")).rows[0].relrowsecurity,true);
      assert.equal((await db.query("SELECT has_table_privilege('anon','scienceinquiryvideos','SELECT') AS allowed")).rows[0].allowed,false);
      assert.equal((await db.query("SELECT has_table_privilege('authenticated','scienceinquirylikes','INSERT') AS allowed")).rows[0].allowed,false);
    }
  });
}

test('real video processing compresses, preserves portrait shape, handles durationless WebM and rejects invalid/long files',async t=>{
  const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'buio-inquiry-video-test-'));
  t.after(()=>fsp.rm(directory,{recursive:true,force:true}));
  const video=require('../science-inquiry-app/video');
  const ffmpeg=video.ffmpegPath();
  const generate=(args)=>run(ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...args],{timeout:60000,maxBuffer:16*1024*1024,windowsHide:true});
  const landscape=path.join(directory,'landscape.mp4');
  await generate(['-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=2','-f','lavfi','-i','sine=frequency=440:duration=2',
    '-c:v','libx264','-preset','ultrafast','-crf','0','-threads','2','-c:a','aac','-metadata','location=+22.000+114.000/',landscape]);
  const result=await video.processVideo(landscape,directory);
  assert.ok(result.videoBytes<result.originalBytes*.6,'a high-bitrate input should be substantially smaller');
  assert.equal(result.width,1280);assert.equal(result.height,720);assert.ok(result.duration>=1.9);
  const info=await video.probe(result.output);assert.equal(info.stream.codec_name,'h264');assert.equal(info.stream.pix_fmt,'yuv420p');
  assert.equal(info.format.tags?.location,undefined);assert.ok((await fsp.stat(result.poster)).size>1000);
  const invalid=path.join(directory,'invalid.mp4');await fsp.writeFile(invalid,'not a video');
  await assert.rejects(video.processVideo(invalid,directory),error=>error.status===400);
  const portrait=path.join(directory,'portrait.mp4');
  await generate(['-f','lavfi','-i','testsrc2=size=720x1280:rate=30:duration=1','-c:v','libx264','-preset','ultrafast','-crf','18','-threads','2',portrait]);
  const portraitResult=await video.processVideo(portrait,directory);assert.equal(portraitResult.width,720);assert.equal(portraitResult.height,1280);
  const webm=path.join(directory,'camera.webm');
  const camera=await run(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x240:rate=15:duration=1',
    '-c:v','libvpx','-threads','2','-f','webm','pipe:1'],{encoding:'buffer',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
  await fsp.writeFile(webm,camera.stdout);
  assert.ok((await video.probe(webm)).duration>=.9);
  assert.ok((await video.processVideo(webm,directory)).duration>=.9);
  const boundary=path.join(directory,'one-minute.mp4');
  await generate(['-f','lavfi','-i','color=c=green:size=160x90:rate=1:duration=60','-c:v','libx264','-preset','ultrafast','-threads','1',boundary]);
  assert.equal((await video.processVideo(boundary,directory)).duration,60);
  const long=path.join(directory,'long.mp4');
  await generate(['-f','lavfi','-i','color=c=green:size=160x90:rate=1:duration=61','-c:v','libx264','-preset','ultrafast','-threads','1',long]);
  await assert.rejects(video.processVideo(long,directory),error=>error.status===400&&/1 分鐘/.test(error.message));
});

test('production storage stays private, keeps signed URLs on the server and fails closed without credentials',async()=>{
  const calls=[];
  const filename=path.join(root,'science-inquiry-app/storage.js'),native=createRequire(filename);
  const storageAPI={
    getBucket:async()=>({data:null,error:{statusCode:404,message:'not found'}}),
    createBucket:async(name,options)=>{calls.push({action:'create',name,options});return {error:null};},
    updateBucket:async(name,options)=>{calls.push({action:'update',name,options});return {error:null};},
    from:name=>({
      upload:async(key,body,options)=>{calls.push({action:'upload',name,key,options,bytes:body.length});return {error:null};},
      remove:async keys=>{calls.push({action:'remove',keys});return {error:null};},
      createSignedUrl:async(key,expires)=>{calls.push({action:'sign',key,expires});return {data:{signedUrl:'https://private.invalid/signed'},error:null};},
    }),
  };
  function load(env) {
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,__dirname:path.dirname(filename),
      process:{env},fetch:async(url,options)=>{calls.push({action:'fetch',url,range:options.headers.Range});return new Response('video');},
      require:id=>id==='../config'?{db:{mode:'postgres'}}:id==='./repository'?{fail:(message,status)=>{throw Object.assign(new Error(message),{status});}}
        :id==='@supabase/supabase-js'?{createClient:()=>({storage:storageAPI})}:native(id),console,Buffer,Response},{filename});
    return module.exports;
  }
  await assert.rejects(load({}).ensure(),error=>error.status===503);
  const storage=load({SUPABASE_URL:'https://private.invalid',SUPABASE_SECRET_KEY:'test-only'});
  await Promise.all([storage.ensure(),storage.ensure()]);
  assert.equal(calls.filter(call=>call.action==='create').length,1);
  assert.equal(calls.find(call=>call.action==='create').options.public,false);
  assert.equal(calls.find(call=>call.action==='update').options.public,false);
  const file=path.join(root,'science-inquiry-app/public/index.html');
  await storage.put(`${randomUUID()}/poster.jpg`,file,'image/jpeg');
  assert.equal(calls.find(call=>call.action==='upload').options.upsert,false);
  const response=await storage.upstream(`${randomUUID()}/video.mp4`,'bytes=100-199',new AbortController().signal);
  assert.equal(await response.text(),'video');
  assert.equal(calls.find(call=>call.action==='sign').expires,60);
  assert.equal(calls.find(call=>call.action==='fetch').range,'bytes=100-199');
  assert.throws(()=>storage.localPath('../escape.mp4'),error=>error.status===404);
});

test('production media proxy checks moderation for every Range/HEAD request without redirecting',async t=>{
  const express=require('express');
  let published=true,upstreamCalls=0;
  const id=randomUUID(),filename=path.join(root,'science-inquiry-app/routes.js'),native=createRequire(filename),module={exports:{}};
  const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
  const repo={fail,accessible:async()=>{if(!published)fail('找不到這段影片。',404);return {storageKey:`${id}/video.mp4`,posterKey:`${id}/poster.jpg`};}};
  const storage={local:()=>false,upstream:async(_key,range)=>{upstreamCalls++;assert.equal(range,'bytes=0-3');return new Response('test',{
    status:206,headers:{'Content-Range':'bytes 0-3/100','Content-Length':'4','Accept-Ranges':'bytes'}});}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,__dirname:path.dirname(filename),console,process,Buffer,AbortController,
    require:id=>id==='./repository'?repo:id==='./storage'?storage:id==='../math-app/repositories/users.repo'?{}:native(id)},{filename});
  const app=express();app.use((req,_res,next)=>{req.session={studentId:'S002',role:'student'};next();});app.use('/api/science-inquiry',module.exports);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/science-inquiry/videos/${id}/media`;
  const response=await fetch(url,{headers:{Range:'bytes=0-3'}});
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 0-3/100');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Location'),null);assert.equal(await response.text(),'test');
  const head=await fetch(url,{method:'HEAD',headers:{Range:'bytes=0-3'}});assert.equal(head.status,206);assert.equal(await head.text(),'');
  published=false;
  assert.equal((await fetch(url,{headers:{Range:'bytes=0-3'}})).status,404);
  assert.equal(upstreamCalls,2,'withdrawn media must never reach private storage');
});
