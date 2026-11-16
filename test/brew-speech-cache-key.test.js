import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('actual Java cache identity changes with text and every voice parameter', t => {
  const javac=process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'javac.exe':'javac') : 'javac';
  const java=process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java') : 'java';
  const probe=spawnSync(javac,['-version'],{encoding:'utf8'});
  if(probe.error?.code==='ENOENT') {
    assert.ok(!process.env.CI, 'CI must provide a JDK to verify the Android speech cache identity.');
    t.skip('JDK is required; this test executes the real pure Java helper when available in Android CI.'); return;
  }
  assert.equal(probe.status,0,probe.stderr);
  const dir=mkdtempSync(path.join(tmpdir(),'luckybean-speech-cache-'));
  try {
    const helper=fileURLToPath(new URL('../android/app/src/main/java/com/luckybean/app/BrewSpeechCacheKey.java',import.meta.url));
    const runner=path.join(dir,'CacheKeyTest.java');
    writeFileSync(runner,[
      'package com.luckybean.app; import java.util.HashSet; import java.util.Set;',
      'public class CacheKeyTest { public static void main(String[] args) {',
      'String a=BrewSpeechCacheKey.create("开始第1段，注水45克","voice-a","zh-CN","engine-a",1.05f,1f);',
      'if(!a.equals(BrewSpeechCacheKey.create("开始第1段，注水45克","voice-a","zh-CN","engine-a",1.05f,1f))) throw new AssertionError("unstable key");',
      'Set<String> keys=new HashSet<>(); keys.add(a);',
      'keys.add(BrewSpeechCacheKey.create("开始第1段，注水60克","voice-a","zh-CN","engine-a",1.05f,1f));',
      'keys.add(BrewSpeechCacheKey.create("开始第1段，注水45克","voice-b","zh-CN","engine-a",1.05f,1f));',
      'keys.add(BrewSpeechCacheKey.create("开始第1段，注水45克","voice-a","zh-TW","engine-a",1.05f,1f));',
      'keys.add(BrewSpeechCacheKey.create("开始第1段，注水45克","voice-a","zh-CN","engine-b",1.05f,1f));',
      'keys.add(BrewSpeechCacheKey.create("开始第1段，注水45克","voice-a","zh-CN","engine-a",.9f,1f));',
      'keys.add(BrewSpeechCacheKey.create("开始第1段，注水45克","voice-a","zh-CN","engine-a",1.05f,.8f));',
      'if(keys.size()!=7) throw new AssertionError("text/voice/locale/engine/rate/pitch collision");',
      'for(String key:keys) if(!key.matches("[a-f0-9]{64}")) throw new AssertionError("invalid SHA256");',
      'System.out.println("7 distinct text/voice cache identities verified"); }}'
    ].join('\n'));
    const compile=spawnSync(javac,['-encoding','UTF-8','-d',dir,helper,runner],{encoding:'utf8'});
    assert.equal(compile.status,0,compile.stderr);
    const run=spawnSync(java,['-cp',dir,'com.luckybean.app.CacheKeyTest'],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.match(run.stdout,/7 distinct/);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
    rmSync(dir,{recursive:true,force:true});
  }
});
