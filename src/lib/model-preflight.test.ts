import {describe,it,expect} from 'vitest';
import {modelPreflight} from './model-preflight';
describe('model setup preflight',()=>{
 it('blocks unknown hardware and insufficient memory',()=>{expect(modelPreflight(0,100,16,7.2,false)).toContain('Could not verify');expect(modelPreflight(8,100,16,7.2,false)).toContain('smaller model');});
 it('reserves download and working space on the model disk',()=>{expect(modelPreflight(16,10,16,7.2,false)).toContain('Free space');expect(modelPreflight(16,12,16,7.2,false)).toBeNull();});
 it('reuses installed weights but retains an operating reserve',()=>{expect(modelPreflight(16,3,16,7.2,true)).toBeNull();expect(modelPreflight(16,1,16,7.2,true)).toContain('Free space');});
});
