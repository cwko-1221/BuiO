'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const run = promisify(execFile);
const { fail } = require('./repository');
const MAX_BYTES = 250 * 1024 * 1024;
const MAX_DURATION = 60;
const MAX_OUTPUT_BYTES = 48 * 1024 * 1024;
const ffmpegPath = () => process.env.FFMPEG_PATH || require('ffmpeg-static');
const ffprobePath = () => process.env.FFPROBE_PATH || require('@ffprobe-installer/ffprobe').path;
const inputOptions = ['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-threads','2'];

async function probe(file) {
  const { stdout } = await run(ffprobePath(), ['-v','error',...inputOptions,'-show_streams','-show_format','-of','json',file],
    { timeout:30000, maxBuffer:1024*1024, windowsHide:true });
  const data = JSON.parse(stdout);
  const stream = data.streams?.find(item => item.codec_type === 'video' && !item.disposition?.attached_pic);
  let duration = Number(data.format?.duration || stream?.duration);
  // MediaRecorder WebM files often have no duration header. Read packet timestamps
  // without decoding to validate these recordings just like uploaded phone files.
  if (stream && !(duration > 0)) {
    const packets = await run(ffprobePath(), ['-v','error',...inputOptions,'-select_streams','v:0',
      '-show_entries','packet=pts_time,duration_time','-of','csv=p=0',file],
    { timeout:30000,maxBuffer:4*1024*1024,windowsHide:true });
    duration = packets.stdout.trim().split(/\r?\n/).reduce((end,line) => {
      const [pts,length] = line.split(',').map(Number);
      return Number.isFinite(pts) ? Math.max(end,pts+(Number.isFinite(length)?length:1/30)) : end;
    },0);
  }
  if (!stream || !Number.isFinite(duration) || duration <= 0) fail('無法讀取影片，請上傳有效的 MP4、MOV 或 WebM 影片。');
  if (duration > MAX_DURATION + 0.1) fail('影片最長為 1 分鐘，請先剪輯後再上傳。');
  if (!(stream.width > 0 && stream.height > 0) || stream.width * stream.height > 3840 * 2160 * 1.1) fail('影片解析度最高支援 4K，請降低解析度後再上傳。');
  return { stream, duration, format:data.format, streams:data.streams };
}

async function processVideo(input, directory) {
  let source;
  try { source = await probe(input); }
  catch (error) { if (error.status) throw error; fail('無法讀取影片，請上傳有效的 MP4、MOV 或 WebM 影片。'); }
  const output = path.join(directory,'compressed.mp4');
  const poster = path.join(directory,'poster.jpg');
  try {
    // Keep the original aspect ratio, never upscale; 1080p, CRF 23, up to 30 fps.
    await run(ffmpegPath(), ['-hide_banner','-loglevel','error','-nostdin',...inputOptions,'-i',input,
      '-map','0:v:0','-map','0:a:0?','-t',String(MAX_DURATION),'-map_metadata','-1','-map_chapters','-1',
      '-vf',"scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
      '-c:v','libx264','-preset','fast','-crf','23','-maxrate','2000k','-bufsize','4000k','-threads','2',
      '-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','128k','-ac','2','-movflags','+faststart','-y',output],
    { timeout:240000, maxBuffer:1024*1024, windowsHide:true });
    // A small, already compatible file can be losslessly repackaged instead of made larger.
    const originalBytes = (await fs.stat(input)).size;
    if ((await fs.stat(output)).size >= originalBytes && source.stream.codec_name === 'h264'
      && source.stream.pix_fmt === 'yuv420p' && source.stream.width <= 1920 && source.stream.height <= 1080
      && source.streams.every(item => ['video','audio'].includes(item.codec_type) && (item.codec_type !== 'audio' || item.codec_name === 'aac'))
      && originalBytes <= MAX_OUTPUT_BYTES) {
      const remux = path.join(directory,'remux.mp4');
      await run(ffmpegPath(), ['-hide_banner','-loglevel','error','-nostdin',...inputOptions,'-i',input,
        '-map','0:v:0','-map','0:a:0?','-c','copy','-map_metadata','-1','-map_chapters','-1','-movflags','+faststart','-y',remux],
      { timeout:30000, maxBuffer:1024*1024, windowsHide:true });
      if ((await fs.stat(remux)).size < (await fs.stat(output)).size) await fs.copyFile(remux,output);
    }
    await run(ffmpegPath(), ['-hide_banner','-loglevel','error','-nostdin',...inputOptions,'-i',output,
      '-frames:v','1','-vf','scale=640:-2','-threads','1','-y',poster], { timeout:30000,maxBuffer:1024*1024,windowsHide:true });
    const videoBytes = (await fs.stat(output)).size;
    if (videoBytes > MAX_OUTPUT_BYTES) fail('壓縮後影片仍然過大，請縮短影片後重試。');
    const final = await probe(output);
    if (final.duration < source.duration - 1) fail('影片未能完整處理，請重新匯出後上傳。');
    return { output, poster, duration:final.duration, width:final.stream.width, height:final.stream.height,
      originalBytes, videoBytes };
  } catch (error) {
    if (error.status) throw error;
    console.error('[science-inquiry/video]', error.code || 'TRANSCODE_FAILED');
    fail('影片壓縮未能完成，請稍後再試或先縮短影片。',422);
  }
}

module.exports = { MAX_BYTES, MAX_DURATION, MAX_OUTPUT_BYTES, processVideo, probe, ffmpegPath };
