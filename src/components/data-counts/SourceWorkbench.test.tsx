import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {SourceWorkbench} from './SourceWorkbench';
import {readSource} from '@/lib/extraction/readers';
vi.mock('@/lib/extraction/readers',()=>({readSource:vi.fn()}));
beforeEach(()=>{HTMLElement.prototype.scrollTo=vi.fn();HTMLElement.prototype.scrollIntoView=vi.fn();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};vi.mocked(readSource).mockResolvedValue({name:'kept.csv',hash:'hash',format:'csv',segments:[{id:'s',label:'Cell A2',text:'140'}],entities:[{id:'e',kind:'source field',segment_id:'s',label:'Sodium',value:'140',unit:null,assertion:'source value',quote:'140',subject:null,origin:'parser',start:0,end:3,supported:true}],warnings:[],mode:'structured',original:'Sodium\n140'});});
it('retains reviewed source when replacement is cancelled or unreadable',async()=>{
 render(<SourceWorkbench/>);fireEvent.click(screen.getByRole('button',{name:'Load example note'}));await screen.findByText('kept.csv');fireEvent.click(screen.getByLabelText('I reviewed the parsed source fields and file coverage.'));
 fireEvent.click(screen.getByRole('button',{name:'Load example note'}));expect(screen.getByRole('dialog')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Keep reviewing'}));expect(readSource).toHaveBeenCalledTimes(1);
 vi.mocked(readSource).mockRejectedValueOnce(Error('Invalid file'));
 fireEvent.click(screen.getByRole('button',{name:'Load example note'}));fireEvent.click(screen.getByRole('button',{name:'Replace document'}));await screen.findByRole('alert');expect(screen.getByText('kept.csv')).toBeInTheDocument();expect(screen.getByLabelText('I reviewed the parsed source fields and file coverage.')).toBeChecked();expect(screen.getByRole('button',{name:'Export review & open questions'})).toBeEnabled();
});
it('discloses original source and unencrypted export before opening a save destination',async()=>{
 render(<SourceWorkbench/>);fireEvent.click(screen.getByRole('button',{name:'Load example note'}));await screen.findByText('kept.csv');expect(screen.getByRole('button',{name:'Export review & open questions'})).toBeDisabled();fireEvent.click(screen.getByLabelText('I reviewed the parsed source fields and file coverage.'));fireEvent.click(screen.getByRole('button',{name:'Export review & open questions'}));expect(screen.getByRole('dialog')).toHaveTextContent('original document text');expect(screen.getByRole('dialog')).toHaveTextContent('not de-identified or encrypted');fireEvent.click(screen.getByRole('button',{name:'Keep reviewing'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
