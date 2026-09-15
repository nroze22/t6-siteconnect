import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ReleaseActions} from './ReleaseActions';
afterEach(cleanup);
const base={approved:false,reviewed:false,saved:true,exporting:false,hasBaseline:false,exportNotice:'',onReviewed:vi.fn(),onApprove:vi.fn(),onEncrypted:vi.fn(),onPlaintext:vi.fn(),onIncremental:vi.fn()};
it('keeps export unavailable until approval and requires explicit review',()=>{
 const view=render(<ReleaseActions {...base}/>);
 expect(screen.getByRole('button',{name:'Authorize demo package'})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'Export encrypted demo package'})).toBeNull();
 view.rerender(<ReleaseActions {...base} reviewed/>);
 expect(screen.getByRole('button',{name:'Authorize demo package'})).toBeEnabled();
 view.rerender(<ReleaseActions {...base} reviewed saved={false}/>);
 expect(screen.getByRole('button',{name:'Authorize demo package'})).toBeDisabled();
});
it('leads with encrypted export after approval while retaining deliberate advanced formats',()=>{
 render(<ReleaseActions {...base} approved hasBaseline exportNotice="Encrypted copy saved on this Mac. No broker transmission."/>);
 expect(screen.queryByRole('button',{name:'Authorize demo package'})).toBeNull();
 expect(screen.getByRole('button',{name:'Export encrypted demo package'})).toBeEnabled();
 expect(screen.getByText('Other export formats').closest('details')).not.toHaveAttribute('open');
 fireEvent.click(screen.getByText('Other export formats'));
 fireEvent.click(screen.getByRole('button',{name:'Export plaintext demo package'}));
 expect(base.onPlaintext).toHaveBeenCalledOnce();
 expect(screen.getByRole('status')).toHaveTextContent('No broker transmission');
});
it('disables all exports while processing and while storage is unavailable',()=>{
 const view=render(<ReleaseActions {...base} approved exporting/>);
 expect(screen.getByRole('button',{name:'Preparing export…'})).toBeDisabled();
 view.rerender(<ReleaseActions {...base} approved saved={false}/>);
 expect(screen.getByRole('button',{name:'Export encrypted demo package'})).toBeDisabled();
});
