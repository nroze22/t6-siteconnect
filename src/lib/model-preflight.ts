export function modelPreflight(ramGiB:number, freeGiB:number, minimumRamGiB:number, downloadGB:number, installed:boolean):string|null {
 if(!Number.isFinite(ramGiB)||ramGiB<=0||!Number.isFinite(freeGiB)||freeGiB<=0)return 'Could not verify memory and model-drive space. Refresh the device check before continuing.';
 if(ramGiB<minimumRamGiB)return `This model needs at least ${minimumRamGiB} GiB of memory under our setup policy. Choose a smaller model.`;
 const required=installed?2:downloadGB*1e9/1024**3+5;
 if(freeGiB<required)return `Need ${required.toFixed(1)} GiB free on the model drive, including working space; ${freeGiB.toFixed(1)} GiB is available. Free space and retry.`;
 return null;
}
