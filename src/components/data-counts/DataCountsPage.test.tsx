import {beforeEach,describe,expect,it} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {DataCountsPage} from './DataCountsPage';
import {useAppStore} from '@/stores/use-app-store';

describe('Data COUNTS guided experience',()=>{
 beforeEach(()=>{HTMLElement.prototype.scrollTo=()=>{};cleanup();localStorage.clear();useAppStore.setState({currentPage:'dashboard',theme:'light'});});
 it('explains the demo before opening the request, and remembers completion',()=>{
  const view=render(<DataCountsPage/>);
  expect(screen.getByRole('heading',{name:'A clear path from hospital records to a reviewed release.'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  expect(screen.getByRole('heading',{name:'Inspect. Resolve. Review.'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  fireEvent.click(screen.getByRole('button',{name:'Open the example request'}));
  expect(screen.getByRole('button',{name:'Inspect source records'})).toBeTruthy();
  view.unmount();render(<DataCountsPage/>);
  expect(screen.queryByRole('button',{name:'Continue'})).toBeNull();
  expect(screen.getByRole('button',{name:'Quick introduction'})).toBeTruthy();
 });
 it('guides source correction and keeps authorization disabled until explicit review',async()=>{
  localStorage.setItem('siteconnect-data-counts-intro-v1','complete');
  render(<DataCountsPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Run quality checks'}));
  await screen.findByText('2 release blockers');
  fireEvent.click(screen.getByRole('button',{name:'Load corrected source v2'}));
  fireEvent.click(screen.getByRole('button',{name:'Run quality checks'}));
  await screen.findByRole('heading',{name:'All 144 source records are accounted for'});
  fireEvent.click(screen.getByRole('button',{name:'Open release review'}));
  const approve=screen.getByRole('button',{name:'Authorize demo package'}) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  await waitFor(()=>expect((screen.getByRole('button',{name:'Export demo package'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Quick introduction'}));
  fireEvent.click(screen.getByRole('button',{name:'Skip introduction'}));
  fireEvent.click(screen.getByRole('button',{name:'Release & delivery'}));
  expect((screen.getByRole('button',{name:'Export demo package'}) as HTMLButtonElement).disabled).toBe(false);
 });
});
