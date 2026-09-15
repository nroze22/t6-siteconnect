import {describe,it,expect} from 'vitest';
import {reviewNote} from './note-review';
const good=()=>({patient:'SYN-003',labs:[{test:'creatinine',value:1.36,unit:'mg/dL',quote:'creatinine was 1.36 mg/dL'},{test:'potassium',value:4.44,unit:'mmol/L',quote:'potassium was 4.44 mmol/L'}]});
describe('source-backed note review',()=>{
 it('accepts exactly two source-supported measurements',()=>expect(reviewNote(good()).complete).toBe(true));
 it('blocks a changed value even with a real quote',()=>{const r=good();r.labs[0]!.value=1.18;expect(reviewNote(r).complete).toBe(false);});
 it('blocks invented evidence, wrong patient and missing measurements',()=>{const r=good();r.labs[0]!.quote='Creatinine is normal';expect(reviewNote(r).rows[0]!.supported).toBe(false);r.patient='SYN-004';expect(reviewNote(r).complete).toBe(false);expect(reviewNote({patient:'SYN-003',labs:[]}).complete).toBe(false);});
 it('does not accept duplicates in place of the second test',()=>{const r=good();r.labs[1]=r.labs[0]!;expect(reviewNote(r).complete).toBe(false);});
 it('rejects malformed model output instead of substituting fixtures',()=>expect(()=>reviewNote({labs:'bad'})).toThrow());
});
