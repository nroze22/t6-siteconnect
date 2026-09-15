import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{localStorage.clear();vi.unstubAllEnvs();vi.resetModules();});
it('starts in Data COUNTS without overwriting historical workspace preferences',async()=>{
 vi.stubEnv('VITE_ENABLE_LEGACY_WORKSPACES','false');vi.resetModules();
 const historic=JSON.stringify({mode:'admin',hasChosen:true});localStorage.setItem('siteconnect-workspace-mode-v2',historic);
 const {useModeStore}=await import('./use-mode-store');
 expect(useModeStore.getState().currentMode).toBe('data-counts');
 expect(localStorage.getItem('siteconnect-workspace-mode-v2')).toBe(historic);
});
it('retains historical workspace support in explicitly enabled development builds',async()=>{
 vi.stubEnv('VITE_ENABLE_LEGACY_WORKSPACES','true');vi.resetModules();localStorage.setItem('siteconnect-workspace-mode-v2',JSON.stringify({mode:'admin',hasChosen:true}));
 const {useModeStore}=await import('./use-mode-store');expect(useModeStore.getState().currentMode).toBe('admin');
});
