import {NOTE} from '../data-counts/engine';
import type {ExpectedEntity} from './evaluation';
// Human-authored synthetic annotations. Exact evidence spans intentionally exclude unrelated sentences.
export const noteGold:ExpectedEntity[]=[['creatinine','1.36','mg/dL'],['potassium','4.44','mmol/L']].map(([label,value,unit])=>({id:`note-${label}`,field:'Observation.valueQuantity',segment_id:'s1',kind:'lab',label:label!,value:value!,unit:unit!,subject:'SYN-003',assertion:'present',start:NOTE.indexOf('Patient SYN-003'),end:NOTE.indexOf(`${value} ${unit}`)+`${value} ${unit}`.length}));
