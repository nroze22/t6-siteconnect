import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {AiSetupPanel} from './SettingsPage';
import * as provider from '@/lib/data-provider';
vi.mock('@/lib/tauri',async importOriginal=>({...await importOriginal<object>(),isTauri:true}));
vi.mock('@/components/ui/Toast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn(),info:vi.fn()})}));
vi.mock('@/lib/data-provider',async importOriginal=>({...await importOriginal<object>(),getModelSetupJob:vi.fn(),startModelSetupJob:vi.fn(),cancelModelSetupJob:vi.fn(),getLlmStatus:vi.fn(),checkLlmHealth:vi.fn().mockResolvedValue(true),checkOllamaStatus:vi.fn(),detectSystemHardware:vi.fn(),configureOllamaBackend:vi.fn(),testOllamaInference:vi.fn(),pullOllamaModel:vi.fn(),listenForPullProgress:vi.fn().mockResolvedValue(()=>{})}));
beforeEach(()=>{
 vi.mocked(provider.getModelSetupJob).mockResolvedValue(null);
 vi.mocked(provider.startModelSetupJob).mockResolvedValue({model:"gemma4:e2b",phase:"testing",message:"Verifying response",updated:""});
 vi.mocked(provider.getLlmStatus).mockResolvedValue({status:'not_configured',model_name:null,port:11434,backend:'ollama'});
 vi.mocked(provider.checkOllamaStatus).mockResolvedValue({installed:true,running:true,models:[{name:'gemma4:e2b',size:7200000000,modified_at:''}]});
 vi.mocked(provider.detectSystemHardware).mockResolvedValue({total_ram_bytes:0,total_ram_gb:16,free_disk_bytes:0,free_disk_gb:50,recommended_tier:'recommended',recommended_model:'gemma4:e2b'});
 vi.mocked(provider.configureOllamaBackend).mockResolvedValue({status:'model_ready',model_name:'gemma4:e2b',port:11434,backend:'ollama'});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('restores failed native setup without claiming success',async()=>{
 vi.mocked(provider.getModelSetupJob).mockResolvedValue({model:'gemma4:e2b',phase:'error',message:'Model response check failed',updated:''});
 render(<AiSetupPanel/>);await screen.findByText('Model response check failed');
 expect(screen.queryByText('Setup complete')).toBeNull();expect(screen.getByRole('button',{name:'Resume setup'})).toBeTruthy();
});
it('reattaches to a native job after navigation',async()=>{
 vi.mocked(provider.getModelSetupJob).mockResolvedValue({model:'gemma4:e2b',phase:'downloading_model',message:'Downloading model layers',updated:''});
 const view=render(<AiSetupPanel/>);await screen.findByText('Downloading model layers');view.unmount();render(<AiSetupPanel/>);
 await screen.findByText('Downloading model layers');expect(screen.getByRole('button',{name:'Cancel setup'})).toBeTruthy();expect(provider.startModelSetupJob).not.toHaveBeenCalled();
});
it('refreshes disk space before activating even an installed model',async()=>{
 render(<AiSetupPanel/>);const card=await screen.findByRole('button',{name:/Gemma 4 E2B/});
 await waitFor(()=>expect((card as HTMLButtonElement).disabled).toBe(false));
 vi.mocked(provider.detectSystemHardware).mockResolvedValue({total_ram_bytes:0,total_ram_gb:16,free_disk_bytes:0,free_disk_gb:1,recommended_tier:'recommended',recommended_model:'gemma4:e2b'});
 fireEvent.click(card);await screen.findAllByText(/Need 2.0 GiB free/);expect(provider.startModelSetupJob).not.toHaveBeenCalled();
});
