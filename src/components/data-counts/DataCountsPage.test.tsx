import {ToastProvider} from '@/components/ui/Toast';
import {fixture} from '@/lib/data-counts/engine';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,within} from '@testing-library/react';
import {DataCountsPage} from './DataCountsPage';
import {DataCountsNavigation} from './DataCountsNavigation';
import {useDataCountsNavigation} from '@/lib/data-counts/navigation';
import {useAppStore} from '@/stores/use-app-store';

describe('Data COUNTS guided experience',()=>{
 beforeEach(()=>{HTMLElement.prototype.scrollTo=()=>{};cleanup();localStorage.clear();useDataCountsNavigation.setState({tab:'Overview'});useAppStore.setState({currentPage:'dashboard',theme:'light'});});
 it('explains the demo before opening the request, and remembers completion',()=>{
  const view=render(<><DataCountsNavigation/><DataCountsPage/></>);
  expect(screen.getByRole('heading',{name:'A clear path from hospital records to a reviewed release.'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  expect(screen.getByRole('heading',{name:'Inspect. Resolve. Review.'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  fireEvent.click(screen.getByRole('button',{name:'Open the example request'}));
  expect(screen.getByRole('button',{name:'Inspect source records'})).toBeTruthy();
  view.unmount();render(<><DataCountsNavigation/><DataCountsPage/></>);
  expect(screen.queryByRole('button',{name:'Continue'})).toBeNull();
  expect(screen.getByRole('button',{name:'Quick introduction'})).toBeTruthy();
 });
 it('opens a sidebar destination during introduction without claiming onboarding completion',()=>{
  render(<><DataCountsNavigation/><DataCountsPage/></>);
  fireEvent.click(screen.getByRole('button',{name:'Requests'}));
  expect(screen.queryByRole('region',{name:'Demo introduction'})).toBeNull();
  expect(screen.getByRole('button',{name:'Inspect source records'})).toBeTruthy();
  expect(localStorage.getItem('siteconnect-data-counts-intro-v1')).toBeNull();
  expect(screen.getByRole('button',{name:'Requests'}).getAttribute('aria-current')).toBe('page');
 });
 it('guides source correction and keeps authorization disabled until explicit review',async()=>{
  localStorage.setItem('siteconnect-data-counts-intro-v1','complete');
  render(<><DataCountsNavigation/><DataCountsPage/></>);
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
  fireEvent.click(screen.getByRole('button',{name:'Source records'}));
  fireEvent.click(screen.getByRole('button',{name:'Continue to release review'}));
  expect((screen.getByRole('button',{name:'Export demo package'}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Quick introduction'}));
  fireEvent.click(screen.getByRole('button',{name:'Skip introduction'}));
  fireEvent.click(screen.getByRole('button',{name:'Release & delivery'}));
  expect((screen.getByRole('button',{name:'Export demo package'}) as HTMLButtonElement).disabled).toBe(false);
 });
});

it('keeps source evidence aligned with search and issue navigation',async()=>{
 cleanup();localStorage.clear();useDataCountsNavigation.setState({tab:'Overview'});localStorage.setItem('siteconnect-data-counts-intro-v1','complete');HTMLElement.prototype.scrollTo=()=>{};useAppStore.setState({currentPage:'dashboard',theme:'light'});
 render(<><DataCountsNavigation/><DataCountsPage/></>);
 fireEvent.click(screen.getByRole('button',{name:'Source records'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Search source records'}),{target:{value:'OBS-003-1-5'}});
 expect(screen.getByRole('heading',{name:'Glucose'})).toBeTruthy();
 expect(screen.getByText('Not supplied · do not interpret as a fasting glucose')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Run quality checks'}));
 await screen.findByText('2 release blockers');
 fireEvent.click(screen.getAllByRole('button',{name:'Inspect source evidence'})[0]!);
 expect((screen.getByRole('textbox',{name:'Search source records'}) as HTMLInputElement).value).toBe('');
 expect(screen.getAllByText(/Unit not supplied/).length).toBeGreaterThan(0);
});


it('preserves unreadable saved evidence until an explicit synthetic reset',()=>{
 cleanup();localStorage.clear();useDataCountsNavigation.setState({tab:'Overview'});localStorage.setItem('siteconnect-data-counts-intro-v1','complete');
 localStorage.setItem('siteconnect-data-counts-synthetic-v1','unreadable-evidence');
 render(<><DataCountsNavigation/><DataCountsPage/></>);
 expect(screen.getByRole('heading',{name:'Session storage needs attention'})).toBeTruthy();
 expect(localStorage.getItem('siteconnect-data-counts-synthetic-v1')).toBe('unreadable-evidence');
 fireEvent.click(screen.getByRole('button',{name:'System & support'}));
 fireEvent.click(screen.getByRole('button',{name:'Reset rehearsal'}));
 fireEvent.click(screen.getByRole('button',{name:'Reset synthetic workspace'}));
 expect(JSON.parse(localStorage.getItem('siteconnect-data-counts-synthetic-v1')!).hasRun).toBe(false);
 expect(screen.queryByRole('heading',{name:'Session storage needs attention'})).toBeNull();
});

it('pauses authorization on save failure and resumes after successful retry',async()=>{
 cleanup();localStorage.clear();useDataCountsNavigation.setState({tab:'Overview'});localStorage.setItem('siteconnect-data-counts-intro-v1','complete');
 localStorage.setItem('siteconnect-data-counts-synthetic-v1',JSON.stringify({corrected:true,revoked:false,hasRun:true,approval:null,receipts:[],events:[]}));
 const original=localStorage.setItem;
 const fail=vi.spyOn(localStorage,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key==='siteconnect-data-counts-synthetic-v1')throw Error('Quota exceeded');original.call(this,key,value);});
 try{
 render(<><DataCountsNavigation/><DataCountsPage/></>);
 await screen.findByRole('button',{name:'Open release review'});
 fireEvent.click(screen.getByRole('button',{name:'Open release review'}));
 fireEvent.click(screen.getByRole('checkbox'));
 expect((screen.getByRole('button',{name:'Authorize demo package'}) as HTMLButtonElement).disabled).toBe(true);
 fail.mockRestore();
 fireEvent.click(screen.getByRole('button',{name:'Retry saving session'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Authorize demo package'}) as HTMLButtonElement).disabled).toBe(false));
 }finally{fail.mockRestore();}
});

it('retains imported source through correction navigation without substituting the fixture',async()=>{
 cleanup();localStorage.clear();useDataCountsNavigation.setState({tab:'Overview'});localStorage.setItem('siteconnect-data-counts-intro-v1','complete');
 const rows=fixture(false);rows[0]!.display='Imported source test';
 const imported={name:'site-correct-me.json',hash:'source-hash',rows,evidence:'{"source":"unchanged"}'};
 localStorage.setItem('siteconnect-data-counts-synthetic-v1',JSON.stringify({imported,corrected:true,revoked:false,hasRun:true,approval:null,receipts:[],events:[]}));
 render(<ToastProvider><DataCountsNavigation/><DataCountsPage/></ToastProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Quality review'}));
 await screen.findByText('2 release blockers');
 expect(screen.queryByRole('button',{name:'Load corrected source v2'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Review corrected file'}));
 fireEvent.click(within(screen.getByRole('navigation',{name:'Data operations'})).getByRole('button',{name:'Model setup'}));
 fireEvent.click(screen.getByRole('button',{name:'Source records'}));
 expect(screen.getAllByText('Imported source test').length).toBeGreaterThan(0);
 expect(JSON.parse(localStorage.getItem('siteconnect-data-counts-synthetic-v1')!).imported).toEqual(imported);
});
