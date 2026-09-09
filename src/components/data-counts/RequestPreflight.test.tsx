import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {RequestPreflight} from './RequestPreflight';
import {REQUEST_TEMPLATE} from '@/lib/data-counts/request-preflight';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('request intake experience',()=>{
 it('shows a valid request as blocked and retains its report after a failed replacement',async()=>{
  vi.stubGlobal('crypto',{subtle:{digest:async()=>new Uint8Array(32).buffer}});
  const download=vi.fn().mockResolvedValue(undefined);render(<RequestPreflight download={download}/>);
  const upload=(text:string)=>fireEvent.change(screen.getByLabelText('Request specification JSON'),{target:{files:[{name:'request.json',size:text.length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer}]}});
  upload(JSON.stringify(REQUEST_TEMPLATE));await screen.findByText('Format valid · execution blocked');
  fireEvent.click(screen.getByText('Export readiness report'));expect(download.mock.calls[0]?.[1].report.executionAllowed).toBe(false);
  upload('{bad');await screen.findByRole('alert');expect(screen.getByRole('alert')).toHaveTextContent('previous report remains');expect(screen.getByText('Format valid · execution blocked')).toBeVisible();
  fireEvent.click(screen.getByText('Clear request review'));await waitFor(()=>expect(screen.queryByText('Export readiness report')).not.toBeInTheDocument());
 });
});
