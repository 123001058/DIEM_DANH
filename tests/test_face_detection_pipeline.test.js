'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/admin/admin.face.js','utf8');
const fn = name => {
  const match = source.match(new RegExp(`^async function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^}`, 'm'));
  assert(match,name); return match[0];
};
const deferred = () => { let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; };

function environment() {
  const snapshot={width:480,height:320};
  const calls=[], events=[], results=[];
  let internal=async()=>{};
  const ctx=vm.createContext({
    document:{createElement:()=>({})},
    setTimeout: callback=>queueMicrotask(callback),
    faceapi:{
      TinyFaceDetectorOptions: class { constructor(value){Object.assign(this,value);} },
      detectSingleFace: async (image,options)=>{
        assert.equal(options.scoreThreshold,0.22); calls.push(options.inputSize);
        return await results.shift();
      },
      DetectSingleFaceLandmarksTask: class {
        constructor(parent,image,tiny){this.parent=parent;assert.equal(tiny,true);assert.equal(image,snapshot);}
        async withFaceDescriptor(){const {detection}=await this.parent;events.push('descriptor');return {detection,descriptor:new Float32Array(128)};}
      }
    },
    processAdminCameraFrameInternal: async (...args)=>internal(...args)
  });
  vm.runInContext('let adminFaceDetectorInputSize=320,adminFaceFrameBusy=false,adminCameraActive=true,adminInferenceRunning=true,adminEspStreamGeneration=1;\n'+[
    'detectAdminFaceWithDescriptor','warmupAdminFaceDetector','processAdminCameraFrame'
  ].map(fn).join('\n'),ctx);
  return {snapshot,calls,events,results,run:s=>vm.runInContext(s,ctx),
    detect:callback=>ctx.detectAdminFaceWithDescriptor(snapshot,callback||(()=>events.push('box')),1),
    process:()=>ctx.processAdminCameraFrame(snapshot),setInternal:value=>{internal=value;}};
}

(async()=>{
  const face={box:{x:20,y:30,width:80,height:90}};
  let e=environment();e.results.push(face);
  const result=await e.detect();
  assert.deepEqual(e.calls,[320]); assert.equal(result.detection,face);
  assert.deepEqual(e.events,['box','descriptor']);
  console.log('PASS box precedes descriptor; one detector call and original detection reused');

  e=environment();e.results.push(null,face,face);
  assert(await e.detect());assert.deepEqual(e.calls,[320,416]);
  await e.detect();assert.deepEqual(e.calls,[320,416,416]);
  console.log('PASS 416 recovers missed face and stays selected for continued tracking');

  e=environment();e.results.push(null,null);
  assert.equal(await e.detect(),null);assert.equal(e.events.length,0);
  assert.equal(e.run('adminFaceDetectorInputSize'),320);
  console.log('PASS no face returns no descriptor/box and restores initial detector size');

  e=environment();const detection=deferred();e.results.push(detection.promise);
  const pending=e.detect();e.run('adminCameraActive=false');detection.resolve(face);
  assert.equal(await pending,null);assert.equal(e.events.length,0);
  e=environment();const old=deferred();e.results.push(old.promise);
  const changed=e.detect();e.run('adminEspStreamGeneration++');old.resolve(face);
  assert.equal(await changed,null);assert.equal(e.events.length,0);
  console.log('PASS stopped camera and changed host reject late detections');

  e=environment();e.results.push(face);
  assert.equal(await e.detect(()=>{e.events.push('box');e.run('adminCameraActive=false');}),null);
  assert.deepEqual(e.events,['box']);
  console.log('PASS stop between early box and descriptor prevents remaining work');

  e=environment();let running=0;const work=deferred();
  e.setInternal(async()=>{running++;await work.promise;});
  const first=e.process();await e.process();assert.equal(running,1);
  work.resolve();await first;assert.equal(e.run('adminFaceFrameBusy'),false);
  e.setInternal(async()=>{throw Error('model failed');});
  await assert.rejects(e.process(),/model failed/);assert.equal(e.run('adminFaceFrameBusy'),false);
  console.log('PASS overlapping frames are skipped and failures release the pipeline');

  e=environment();await e.run('warmupAdminFaceDetector()');
  assert.deepEqual(e.calls,[320,416]);assert.equal(e.events.length,0);
  console.log('PASS both detector shapes warm during loading without identity or attendance');
})().catch(error=>{console.error(error);process.exitCode=1;});
