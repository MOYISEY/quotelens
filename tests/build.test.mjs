import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
test('clean build removes stale output and each manifest hash matches the source',async()=>{
  const root=resolve(import.meta.dirname,'..');
  const fixture=await mkdtemp(join(root,'.quotelens-test-'));
  try{
    await mkdir(join(fixture,'src'));await mkdir(join(fixture,'scripts'));
    const files=['index.html','favicon.svg','src/styles.css','src/app.js','src/engine.js','src/io.js','src/explain.js'];
    for(const file of [...files,'scripts/build.mjs'])await copyFile(resolve(root,file),resolve(fixture,file));
    execFileSync(process.execPath,['scripts/build.mjs'],{cwd:fixture});
    await writeFile(join(fixture,'dist/src/retired-synthetic.mjs'),'retired synthetic output');
    execFileSync(process.execPath,['scripts/build.mjs'],{cwd:fixture});
    assert.equal((await readdir(join(fixture,'dist/src'))).includes('retired-synthetic.mjs'),false);
    const manifest=JSON.parse(await readFile(join(fixture,'dist/build.json'),'utf8'));
    assert.deepEqual(Object.keys(manifest.files),files);
    for(const file of files){const bytes=await readFile(join(fixture,'dist',file));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[file]);assert.deepEqual(bytes,await readFile(join(root,file)));}
  }finally{
    if(!relative(root,fixture).startsWith('.quotelens-test-'))throw new Error('Unsafe test cleanup path');
    await rm(fixture,{recursive:true,force:true});
  }
});
