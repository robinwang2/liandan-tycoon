import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(process.argv[2] || join(root, 'unity/Game/Logs/audio-js'));
const table = JSON.parse(await readFile(join(root, 'src/data/tables/audio.json')));
const scenarios = JSON.parse(await readFile(join(root,'tools/audio/scenarios.json')));
const cases = [...table.SFX.map(({ id }) => 'sfx-' + id), ...Object.keys(table.MOODS).map(id => 'music-' + id), ...Object.keys(scenarios)];
await mkdir(output, { recursive: true });
const remaining = new Set(cases);
const profile = await mkdtemp(join(tmpdir(), 'liandan-audio-'));
const files = new Map([
  ['/page.mjs', 'tools/audio/render-page.mjs'], ['/src/audio/audio.js', 'src/audio/audio.js'],
  ['/src/data/tables/audio.json', 'src/data/tables/audio.json'],
  ['/scenarios.json', 'tools/audio/scenarios.json'],
]);
let browser;
const { promise, resolve: done, reject: fail } = Promise.withResolvers();
const server = createServer(async (req, res) => {
  try {
    const path = req.url;
    if (process.env.AUDIO_DEBUG) console.log(req.method, path);
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<meta charset=utf-8><script type=module src="/page.mjs"></script>'); }
    else if (files.has(path)) {
      res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : 'text/javascript');
      res.end(await readFile(join(root, files.get(path))));
    } else if (req.method === 'POST' && path === '/error') {
      const chunks = []; for await (const c of req) chunks.push(c);
      throw new Error(Buffer.concat(chunks).toString());
    } else if (req.method === 'POST' && remaining.has(path.slice(1))) {
      const id = path.slice(1), chunks = [];
      for await (const c of req) chunks.push(c);
      const wav = Buffer.concat(chunks);
      if (wav.length !== 44 + (id.startsWith('sfx-') ? 3 : 16) * 48000 * 8) throw Error('WAV 长度异常 ' + id);
      await writeFile(join(output, id + '.wav'), wav);
      remaining.delete(id); console.log(id); res.end('ok');
      if (!remaining.size) done();
    } else { res.statusCode = 404; res.end(); }
  } catch (error) { res.statusCode = 500; res.end(); fail(error); }
});
try {
  await writeFile(join(output,'.incomplete'), 'JS 离线渲染中\n');
  await new Promise((ok, bad) => server.once('error', bad).listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + server.address().port;
  const exe = process.env.CHROME_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = spawn(exe, ['--headless', '--disable-gpu', '--in-process-gpu', '--disable-background-timer-throttling',
    '--disable-background-networking', '--no-proxy-server',
    ...(process.env.AUDIO_CHROME_LOCAL === '1' ? ['--no-sandbox'] : []),
    ...(process.env.AUDIO_DEBUG ? ['--enable-logging=stderr', '--v=0'] : []),
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, url], { windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'] });
  browser.once('error', fail).once('exit', code => fail(Error('Chrome 提前退出 ' + code)));
  const timeout = setTimeout(() => fail(Error('Chrome 渲染超时，剩余 ' + remaining.size)), 180000);
  try { await promise; } finally { clearTimeout(timeout); }
  await rm(join(output,'.incomplete'));
  console.log('JS 离线渲染完成', output);
} finally {
  if (browser?.exitCode === null && browser.pid) {
    const exited = new Promise(ok => browser.once('exit', ok)); browser.kill(); await exited;
  }
  server.closeAllConnections(); server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
