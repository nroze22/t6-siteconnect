import {CompactEncrypt,compactDecrypt,base64url} from 'jose';
import {z} from 'zod';
export const MAX_ENCRYPTED_BYTES=24*1024*1024;
const TYPE='siteconnect-demo-delivery+jwe';
export function newRecoveryKey(){return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));}
function keyBytes(key:string){if(!/^[A-Za-z0-9_-]{43}$/.test(key))throw Error('Enter the complete 43-character recovery key.');const bytes=base64url.decode(key);if(base64url.encode(bytes)!==key)throw Error('Recovery key is not valid.');return bytes;}
const envelope=z.object({payload:z.object({format:z.literal('siteconnect-demo-delivery/1'),synthetic:z.literal(true),manifest:z.object({packageId:z.string(),outputCount:z.number().int().nonnegative()}),observations:z.array(z.unknown())}),integrity:z.object({algorithm:z.literal('SHA-256'),scope:z.literal('UTF-8 JSON.stringify(payload)'),sha256:z.string().regex(/^[0-9a-f]{64}$/),authenticated:z.literal(false)})});
export async function encryptDelivery(payload:unknown,key:string){
 envelope.parse(payload);const raw=new TextEncoder().encode(JSON.stringify(payload));if(raw.length>MAX_ENCRYPTED_BYTES/2)throw Error('Package exceeds the supported encrypted export size.');
 const bytes=keyBytes(key);try{return await new CompactEncrypt(raw).setProtectedHeader({alg:'dir',enc:'A256GCM',typ:TYPE}).encrypt(bytes);}finally{bytes.fill(0);}
}
export async function decryptDelivery(jwe:string,key:string):Promise<{data:unknown;packageId:string;count:number}>{
 if(jwe.length>MAX_ENCRYPTED_BYTES)throw Error('Encrypted file exceeds the supported size.');const bytes=keyBytes(key);
 try{
  const {plaintext,protectedHeader}=await compactDecrypt(jwe,bytes,{keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM']});
  if(protectedHeader.typ!==TYPE)throw Error('Wrong export type');
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));const checked=envelope.parse(data);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.payload)))),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==checked.integrity.sha256||checked.payload.observations.length!==checked.payload.manifest.outputCount)throw Error('Payload mismatch');
  return {data,packageId:checked.payload.manifest.packageId,count:checked.payload.observations.length};
 }catch{throw Error('Cannot open this export. Check the recovery key and file. A damaged or altered file cannot be recovered.');}finally{bytes.fill(0);}
}
