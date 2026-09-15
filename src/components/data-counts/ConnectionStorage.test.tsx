import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ConnectionStorage} from './ConnectionStorage';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('@/lib/tauri',()=>({isTauri:true}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('does not offer creation if storage inspection fails',async()=>{
 mocks.invoke.mockRejectedValue(Error('permission denied'));
 render(<ConnectionStorage onReady={()=>{}} onClose={()=>{}}/>);
 await screen.findByRole('alert');
 expect(screen.queryByRole('button',{name:'Create storage'})).toBeNull();
 expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
it('unlocks existing storage without initialization and clears the passphrase',async()=>{
 mocks.invoke.mockImplementation((cmd:string)=>Promise.resolve(cmd==='check_database_exists'?true:undefined));
 const ready=vi.fn();render(<ConnectionStorage onReady={ready} onClose={()=>{}}/>);
 fireEvent.change(await screen.findByLabelText('Database passphrase'),{target:{value:'local-test-secret'}});
 fireEvent.click(screen.getByRole('button',{name:'Unlock storage'}));
 await waitFor(()=>expect(ready).toHaveBeenCalledOnce());
 expect(mocks.invoke).toHaveBeenCalledWith('unlock_database',{passphrase:'local-test-secret'});
 expect(mocks.invoke.mock.calls.some(c=>c[0]==='init_database')).toBe(false);
 expect(screen.getByLabelText('Database passphrase')).toHaveValue('');
});
it('requires confirmation and saved-key acknowledgment, then refuses changed storage',async()=>{
 mocks.invoke.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 const ready=vi.fn();render(<ConnectionStorage onReady={ready} onClose={()=>{}}/>);
 fireEvent.change(await screen.findByLabelText('New database passphrase'),{target:{value:'a-long-test-passphrase'}});
 fireEvent.change(screen.getByLabelText('Confirm passphrase'),{target:{value:'a-long-test-passphrase'}});
 expect(screen.getByRole('button',{name:'Create storage'})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Create storage'}));
 await screen.findByText('Local storage changed. Review the updated form before continuing.');
 expect(screen.getByLabelText('Database passphrase')).toHaveValue('');
 expect(ready).not.toHaveBeenCalled();
 expect(mocks.invoke.mock.calls.some(c=>c[0]==='init_database')).toBe(false);
});
it('creates only after explicit confirmed consent and successful second inspection',async()=>{
 mocks.invoke.mockImplementation((cmd:string)=>Promise.resolve(cmd==='check_database_exists'?false:undefined));
 const ready=vi.fn();render(<ConnectionStorage onReady={ready} onClose={()=>{}}/>);
 fireEvent.change(await screen.findByLabelText('New database passphrase'),{target:{value:'a-long-test-passphrase'}});
 fireEvent.change(screen.getByLabelText('Confirm passphrase'),{target:{value:'a-long-test-passphrase'}});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Create storage'}));
 await waitFor(()=>expect(ready).toHaveBeenCalledOnce());
 expect(mocks.invoke.mock.calls.map(c=>c[0])).toEqual(['check_database_exists','check_database_exists','init_database']);
});
