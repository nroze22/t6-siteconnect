import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {buildRun} from '@/lib/data-counts/engine';
import {ProcessingCounts} from './ProcessingCounts';
it('distinguishes held records from stages never run and directs source correction',async()=>{const review=vi.fn();render(<ProcessingCounts run={await buildRun(false,false)} onReview={review}/>);expect(screen.getByText('Blocked')).toBeVisible();expect(screen.getAllByText('Not run')).toHaveLength(4);fireEvent.click(screen.getByRole('button',{name:'Resolve source issues'}));expect(review).toHaveBeenCalledOnce();});
