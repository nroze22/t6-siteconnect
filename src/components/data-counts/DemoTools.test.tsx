import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {DemoPreparation,NoteDemo} from './DemoTools';
afterEach(cleanup);
it('does not reset a rehearsal with an unresolved receipt',async()=>{const start=vi.fn();render(<DemoPreparation saved pending onStart={start} onModel={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Check demo preparation'}));await screen.findByText(/Browser preview: hardware/);expect((screen.getByRole('button',{name:'Start fresh guided demo'}) as HTMLButtonElement).disabled).toBe(true);expect(start).not.toHaveBeenCalled();});
it('never simulates local AI in a browser',()=>{render(<NoteDemo/>);expect((screen.getByRole('button',{name:'Extract synthetic note'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.queryByText(/live local response/)).toBeNull();});
