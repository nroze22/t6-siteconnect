export type Box={x:number;y:number;width:number;height:number};
export type TextRun={start:number;end:number;box:Box};
export type Segment={id:string;label:string;text:string;page?:number;runs?:TextRun[];pageWidth?:number;pageHeight?:number;image?:string};
export type Entity={id:string;segment_id:string;kind:string;label:string;value:string;unit:string|null;assertion:string;quote:string;subject:string|null;origin:'parser'|'model';start:number;end:number;supported:boolean;problem?:string};
export type SourceFile={name:string;hash:string;format:string;segments:Segment[];entities:Entity[];warnings:string[];mode:'structured'|'narrative';original:string;releaseRows?:import('@/lib/data-counts/engine').Lab[];releaseProblem?:string};
export const MAX_FILE_BYTES=12*1024*1024;
export const MAX_TEXT=100000;
export function parserEntity(segment:Segment,label:string,value:string,id:string):Entity{return {id,segment_id:segment.id,kind:'source field',label,value,unit:null,assertion:'source value',quote:segment.text,subject:null,origin:'parser',start:0,end:segment.text.length,supported:true};}
export async function digest(bytes:BufferSource){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
