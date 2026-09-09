import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {AnnotationEditor} from './AnnotationEditor';
import type {Entity,SourceFile} from '@/lib/extraction/types';
const entity:Entity={id:'e',segment_id:'s',kind:'lab',label:'Glucose',value:'112',unit:null,subject:null,assertion:'present',quote:'Glucose 112',origin:'model',start:0,end:11,supported:true};
const source:SourceFile={name:'synthetic',hash:'sha',format:'txt',mode:'narrative',segments:[{id:'s',label:'P1',text:'Glucose 112'}],entities:[entity],warnings:[],original:'Glucose 112'};
it('records rejection only after a reason and preserves the original candidate',()=>{
 const save=vi.fn();render(<AnnotationEditor entity={entity} source={source} mode="reject" onSave={save} onCancel={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Record rejection'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Source does not establish an observation date'}});
 fireEvent.click(screen.getByRole('button',{name:'Record rejection'}));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({action:'reject',sourceHash:'sha',before:entity,reason:'Source does not establish an observation date'}));
});
