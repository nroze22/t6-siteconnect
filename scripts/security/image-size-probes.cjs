// Run malicious inputs in a subprocess so an unfixed parser cannot hang tests.
const {spawnSync}=require('node:child_process');
const cases={
 icns:`const b=Buffer.alloc(24);b.write('icns');b.writeUInt32BE(24,4);b.write('icp4',8);require('image-size/dist/types/icns').ICNS.calculate(b);`,
 jxl:`const b=Buffer.alloc(16);b.write('jxlp',4);require('image-size/dist/types/jxl').JXL.calculate(b);`,
 heif:`const b=Buffer.alloc(24);b.write('ftyp',4);b.write('heic',8);require('image-size/dist/types/heif').HEIF.calculate(b);`
};
for(const [name,code] of Object.entries(cases)){const r=spawnSync(process.execPath,['-e',`require('image-size/dist/types/${name}');try{${code};process.exit(2)}catch(e){if(!(e instanceof TypeError||e instanceof RangeError||e.message==='No codestream found in JXL container'))throw e;process.exit(0)}`],{timeout:1500});console.log(`${name}: ${r.error?.code||r.status}`);if(r.status!==0)process.exitCode=1;}

const assert=require('node:assert/strict');const size=require('image-size');const valid=size(require('node:fs').readFileSync('public/t6logo.png'));assert.ok(valid.width>0&&valid.height>0);
const icon=Buffer.alloc(16);icon.write('icns');icon.writeUInt32BE(16,4);icon.write('icp4',8);icon.writeUInt32BE(8,12);assert.equal(require('image-size/dist/types/icns').ICNS.calculate(icon).width,16);
console.log('Valid PNG and ICNS dimensions preserved.');
