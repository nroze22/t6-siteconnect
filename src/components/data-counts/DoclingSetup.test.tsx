import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {invoke} from '@tauri-apps/api/core';
import {DoclingSetup} from './DoclingSetup';
vi.mock('@/lib/tauri',()=>({isTauri:true}));
it('shows a failed setup without implying readiness and allows retry',async()=>{
 const onReady=vi.fn();vi.mocked(invoke).mockImplementation(async command=>{if(command==='setup_docling')throw Error('Python 3.12 is required');return {ready:false,freeBytes:8*1024**3,busy:false,phase:'Not started'};});
 render(<DoclingSetup disabled={false} onReady={onReady}/>);
 fireEvent.click(screen.getByText(/Advanced PDF reader/));
 await waitFor(()=>expect(onReady).toHaveBeenCalledWith(false));
 fireEvent.click(screen.getByRole('button',{name:'Set up advanced reader'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Python 3.12 is required');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Set up advanced reader'})).toBeEnabled());
 expect(onReady).not.toHaveBeenCalledWith(true);
});
