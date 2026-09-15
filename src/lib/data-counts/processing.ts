export const STAGE_LABELS={source:'Read source',quality:'Check source quality',cohort:'Apply request scope',permissions:'Apply fixture permissions',transform:'Prepare demo output',reconcile:'Reconcile counts'} as const;
export type ProcessingStage={id:keyof typeof STAGE_LABELS;status:'complete'|'blocked'|'not-run';input:number|null;output:number|null;excluded:number|null;held:number|null};
export function processingCounts(sourceCount:number,issueCount:number,cohortExcluded:number,permissionExcluded:number,outputCount:number):ProcessingStage[]{
 const complete=(id:ProcessingStage['id'],input:number,output:number,excluded=0):ProcessingStage=>({id,status:'complete',input,output,excluded,held:0});
 const source=complete('source',sourceCount,sourceCount);
 if(issueCount)return [source,{id:'quality',status:'blocked',input:sourceCount,output:0,excluded:0,held:sourceCount},...(['cohort','permissions','transform','reconcile'] as const).map(id=>({id,status:'not-run' as const,input:null,output:null,excluded:null,held:null}))];
 const cohortCount=sourceCount-cohortExcluded,permitted=cohortCount-permissionExcluded;
 return [source,complete('quality',sourceCount,sourceCount),complete('cohort',sourceCount,cohortCount,cohortExcluded),complete('permissions',cohortCount,permitted,permissionExcluded),complete('transform',permitted,outputCount),complete('reconcile',outputCount,outputCount)];
}
export function assertProcessingComplete(run:{stages:ProcessingStage[];sourceCount:number;cohortExcluded:number;permissionExcluded:number;output:unknown[]}){
 const expected=processingCounts(run.sourceCount,0,run.cohortExcluded,run.permissionExcluded,run.output.length);
 if(!Array.isArray(run.stages)||run.stages.length!==expected.length)throw Error('Processing stages are incomplete. Rerun source checks.');
 for(let i=0;i<expected.length;i++){
  const stage=run.stages[i]!,wanted=expected[i]!;
  if(stage.id!==wanted.id||stage.status!=='complete'||(['input','output','excluded','held'] as const).some(k=>!Number.isSafeInteger(stage[k])||stage[k]!<0||stage[k]!==wanted[k])||stage.input!==stage.output!+stage.excluded!+stage.held!)throw Error('Processing stages do not reconcile. Rerun source checks before release.');
 }
}
