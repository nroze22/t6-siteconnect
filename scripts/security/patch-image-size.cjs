// Temporary, fail-closed mitigation for GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq.
// Applies only to the reviewed dependency version; retire when upstream is fixed.
const fs=require('node:fs');const path=require('node:path');
let manifest;
try{manifest=require.resolve('image-size/package.json');}catch(error){
    if(error.code!=='MODULE_NOT_FOUND')throw error;
    try{require.resolve('pptxgenjs');}catch(optional){if(optional.code==='MODULE_NOT_FOUND'){console.log('Presentation development tools omitted; image-size mitigation not needed.');process.exit(0);}throw optional;}
    throw error; // Installed presentation tooling must have its required parser.
}
const root=path.dirname(manifest);
if(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version!=='1.2.1')throw Error('Review image-size security mitigation against the new version before installing.');
const patches=[
 ['dist/types/icns.js','    const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;',`    // SiteConnect security guard: every entry must consume a complete header.
    if (imageOffset < 8 || imageOffset + 8 > input.length) throw new TypeError('Invalid ICNS entry bounds');
    const length = (0, utils_1.readUInt32BE)(input, imageOffset + 4);
    if (length < 8 || imageOffset + length > input.length) throw new TypeError('Invalid ICNS entry length');
    const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;`],
 ['dist/types/utils.js','    if (input.length - offset < 4)\n        return;\n    const boxSize = (0, exports.readUInt32BE)(input, offset);',`    // SiteConnect security guard: reject zero/undersized boxes before returning them.
    if (!Number.isSafeInteger(offset) || offset < 0 || input.length - offset < 8)
        return;
    const boxSize = (0, exports.readUInt32BE)(input, offset);
    if (boxSize < 8) throw new TypeError('Invalid image container box length');`],
];
for(const [file,before,after] of patches){const name=path.join(root,file),source=fs.readFileSync(name,'utf8');if(source.includes(after))continue;if(source.split(before).length!==2)throw Error(`Unexpected ${file}: security patch needs review`);fs.writeFileSync(name,source.replace(before,after));}
console.log('Applied reviewed image-size bounds checks (upstream advisories remain listed).');
