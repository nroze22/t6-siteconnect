import {it,expect} from 'vitest';
import {nextReviewId,resultTitle} from './review-navigation';
import type {Entity} from './types';
const rows=['a','b','c','d'].map(id=>({id} as Entity));
it('advances in source order, skipping decisions and wrapping',()=>{expect(nextReviewId(rows,'b',[],[])).toBe('c');expect(nextReviewId(rows,'b',['c'],[])).toBe('d');expect(nextReviewId(rows,'d',[],['a'])).toBe('b');expect(nextReviewId(rows,'missing',[],[])).toBe('a');expect(nextReviewId(rows,'a',['a','b'],['c','d'])).toBeNull();expect(nextReviewId([],'',[],[])).toBeNull();});
it('gives contextual values a meaningful field title while preserving test labels',()=>{expect(resultTitle({kind:'context',field:'Observation.code',label:'2160-0'} as Entity)).toBe('Source test code');expect(resultTitle({kind:'lab',field:'Observation.valueQuantity',label:'Creatinine'} as Entity)).toBe('Creatinine');});
