import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(import.meta.dirname,'..',process.argv.includes('--dist')?'dist':'.');
const portIndex=process.argv.indexOf('--port');
const port=portIndex>=0?Number(process.argv[portIndex+1]):4173;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Port must be 1024–65535');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const allowed=new Set(['/','/index.html','/favicon.svg','/src/styles.css','/src/app.js','/src/engine.js','/src/io.js','/src/explain.js','/src/writer.js','/build.json']);
const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Read-only local server');return;}
  let path;
  try { path=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);res.end();return;}
  if(!allowed.has(path)){res.writeHead(404);res.end('Not found');return;}
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);}
  catch{res.writeHead(404);res.end('Build first if using --dist');}
});
server.listen(port,'127.0.0.1',()=>console.log(`QuoteLens: http://127.0.0.1:${port} (loopback only, ${root})`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
