import {expect,it} from 'vitest';
import {evaluateExtraction,type ExpectedEntity} from './evaluation';
import type {Entity} from './types';
const text='SYN-A sodium 138 mmol/L. SYN-B sodium 138 mmol/L.';
const segments=[{id:'s',label:'Synthetic note',text}];
const gold:ExpectedEntity={id:'a',field:'Observation.valueQuantity',segment_id:'s',kind:'lab',label:'sodium',value:'138',unit:'mmol/L',subject:'SYN-A',assertion:'present',start:0,end:23};
const entity:Entity={...gold,field:'Observation.valueQuantity',id:'model-a',quote:text.slice(0,23),origin:'model',supported:true};
it('scores exact context and provenance and counts duplicates as extras',()=>{expect(evaluateExtraction([gold],[entity],segments)).toMatchObject({truePositive:1,falsePositive:0,falseNegative:0,passed:true});expect(evaluateExtraction([gold],[entity,entity],segments)).toMatchObject({truePositive:1,falsePositive:1,precision:.5,passed:false});});
it('does not credit correct value under wrong subject, assertion, unit or source location',()=>{for(const patch of [{subject:'SYN-B'},{assertion:'negated'},{unit:null},{start:24,end:text.length,quote:text.slice(24)}])expect(evaluateExtraction([gold],[{...entity,...patch}],segments)).toMatchObject({truePositive:0,falsePositive:1,falseNegative:1});});
it('does not trust a supported flag with fabricated offsets or evidence',()=>{expect(evaluateExtraction([gold],[{...entity,quote:'invented'}],segments)).toMatchObject({grounded:0,unsupported:1,passed:false});});
it('keeps empty-set metrics undefined instead of claiming perfect precision or recall',()=>{expect(evaluateExtraction([],[],segments)).toMatchObject({precision:null,recall:null,passed:true});expect(evaluateExtraction([],[entity],segments)).toMatchObject({falsePositive:1,precision:0,recall:null,passed:false});});
it('rejects invalid gold instead of silently measuring against broken expectations',()=>{expect(()=>evaluateExtraction([{...gold,value:'142'}],[entity],segments)).toThrow('Gold');});

it('requires the annotated field and exact occurrence rather than duplicated broad passages',()=>{expect(evaluateExtraction([gold],[{...entity,field:'Patient.id'}],segments).truePositive).toBe(0);const broad={...entity,quote:text,end:text.length};expect(evaluateExtraction([gold],[broad,broad],segments)).toMatchObject({truePositive:0,falsePositive:2,falseNegative:1});});

it('rejects duplicated gold facts with different IDs',()=>{expect(()=>evaluateExtraction([gold,{...gold,id:'duplicate'}],[entity],segments)).toThrow('Duplicate gold');});
