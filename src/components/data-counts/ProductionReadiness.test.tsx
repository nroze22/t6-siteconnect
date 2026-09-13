import {render,screen,fireEvent,within} from '@testing-library/react';
import {expect,it} from 'vitest';
import {ProductionReadiness} from './ProductionReadiness';
import {requirements} from '@/lib/data-counts/requirements';
import {useDataCountsNavigation} from '@/lib/data-counts/navigation';
it('covers every RFI criterion without a self-certification control',()=>{
 render(<ProductionReadiness/>);expect(requirements.map(r=>r.id)).toEqual(Array.from({length:15},(_,i)=>i+1));
 expect(screen.getByText('Live operation is not enabled')).toBeVisible();expect(screen.queryByRole('checkbox')).toBeNull();
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'Most complex'}});expect(screen.queryByText('RFI 3 · Data quality')).toBeNull();
 fireEvent.click(screen.getByText('RFI 1 · Independent hospital operation'));fireEvent.click(within(screen.getByText('RFI 1 · Independent hospital operation').closest('details')!).getByRole('button',{name:'Open System & support'}));expect(useDataCountsNavigation.getState().tab).toBe('System');
});
