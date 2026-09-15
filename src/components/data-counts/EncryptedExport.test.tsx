import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {EncryptedExportDialog} from './EncryptedExport';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};});
it('requires the exact separately saved key and retains it if saving fails',async()=>{
 const save=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),close=vi.fn();render(<EncryptedExportDialog onExport={save} onClose={close}/>);
 const key=(screen.getByLabelText('Recovery key') as HTMLInputElement).value;const button=screen.getByRole('button',{name:'Save encrypted export'});expect(button).toBeDisabled();fireEvent.change(screen.getByLabelText('Confirm recovery key'),{target:{value:'wrong'}});expect(button).toBeDisabled();fireEvent.change(screen.getByLabelText('Confirm recovery key'),{target:{value:key}});fireEvent.click(button);
 await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect((screen.getByLabelText('Recovery key') as HTMLInputElement).value).toBe(key);
 fireEvent.click(screen.getByRole('button',{name:'Save encrypted export'}));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));expect(save).toHaveBeenLastCalledWith(key);
});
it('cancels without exporting or persisting a key',()=>{const save=vi.fn(),close=vi.fn();const storage=vi.spyOn(localStorage,'setItem');render(<EncryptedExportDialog onExport={save} onClose={close}/>);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(close).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();storage.mockRestore();});
