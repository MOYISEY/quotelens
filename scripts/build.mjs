import { mkdir, copyFile, readFile, writeFile, mkdtemp, rm, rename, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const root = await realpath(resolve(import.meta.dirname, '..'));
const files = ['index.html','favicon.svg','src/styles.css','src/app.js','src/engine.js','src/io.js','src/explain.js','src/writer.js'];
const destination=resolve(root,'dist');
// A literal project child only; never recursively remove a link or an outside path.
if(relative(root,destination)!=='dist')throw new Error('Unsafe build target');
try{if((await lstat(destination)).isSymbolicLink())throw new Error('dist must not be a symlink');}catch(e){if(e.code!=='ENOENT')throw e;}
const staging=await mkdtemp(resolve(root,'.quotelens-build-'));
await mkdir(resolve(staging,'src'));
const hashes={};
for(const file of files) {
  const bytes=await readFile(resolve(root,file));
  await writeFile(resolve(staging,file),bytes);
  hashes[file]=createHash('sha256').update(bytes).digest('hex');
}
await writeFile(resolve(staging,'build.json'),JSON.stringify({version:'0.1.0',files:hashes},null,2));
await rm(destination,{recursive:true,force:true});
await rename(staging,destination);
console.log(`Built ${files.length} local static assets → dist/ (no dependencies, no network)`);
