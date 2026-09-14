// Runs a Python file inside the running Blender, over the addon's own socket.
//
// The configured Blender MCP server speaks a different protocol from the addon
// that is actually installed, so its tools time out. The addon itself answers
// plain JSON commands of the form {"type": ..., "params": {...}} on 9876, which
// is all we need.
//
//   node tmp/blender-run.mjs <script.py>        run a Python file
//   node tmp/blender-run.mjs --info             scene summary
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 9876;

export function send(command, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let received = '';
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; socket.destroy(); fn(value); } };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => socket.write(JSON.stringify(command)));
    socket.on('data', (chunk) => {
      received += chunk.toString();
      // The addon writes one JSON document per command; wait until it parses.
      try {
        const parsed = JSON.parse(received);
        finish(resolve, parsed);
      } catch { /* keep reading */ }
    });
    socket.on('timeout', () => finish(reject, new Error(`Blender timed out after ${timeoutMs}ms`)));
    socket.on('error', (error) => finish(reject, error));
    socket.on('close', () => {
      if (settled) return;
      try { finish(resolve, JSON.parse(received)); } catch {
        finish(reject, new Error(`Blender closed without a complete reply: ${received.slice(0, 300)}`));
      }
    });
    socket.connect(PORT, HOST);
  });
}

export async function runPython(code, options) {
  const reply = await send({ type: 'execute_code', params: { code } }, options);
  if (reply.status !== 'success') throw new Error(`Blender: ${reply.message || JSON.stringify(reply)}`);
  // The addon captures stdout and hands it back under result.result.
  return reply.result?.result ?? reply.result;
}

// pathToFileURL, because a hand-built file:// string loses a slash on Windows
// and the guard then silently never fires.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node tmp/blender-run.mjs <script.py> | --info');
    process.exit(2);
  }
  try {
    if (target === '--info') {
      console.log(JSON.stringify(await send({ type: 'get_scene_info', params: {} }), null, 1));
    } else {
      const result = await runPython(await readFile(target, 'utf8'));
      console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
    }
  } catch (error) {
    console.error('FAILED:', error.message);
    process.exit(1);
  }
}
