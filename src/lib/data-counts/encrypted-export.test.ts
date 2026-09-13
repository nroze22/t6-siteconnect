// jsdom uses a different typed-array realm from Node TextEncoder/WebCrypto.
import {expect,it,vi} from 'vitest';
import {CompactEncrypt,base64url} from 'jose';
import {buildRun} from './engine';
import {deliveryExport} from './export';
import {encryptDelivery,decryptDelivery,newRecoveryKey,MAX_ENCRYPTED_BYTES} from './encrypted-export';
vi.stubGlobal('Uint8Array',new TextEncoder().encode('').constructor);
async function source(){const r=await buildRun(true,false);return deliveryExport(r,r.digest,true,false);}
it('round trips an approved export and produces unique ciphertext',async()=>{const data=await source(),key=newRecoveryKey();const a=await encryptDelivery(data,key),b=await encryptDelivery(data,key);expect(a).not.toBe(b);expect(a).not.toContain('Creatinine');const opened=await decryptDelivery(a,key);expect(opened.data).toEqual(data);expect(opened.count).toBe(120);});
it('rejects a wrong key, damaged header, ciphertext, tag and truncated file',async()=>{const key=newRecoveryKey(),jwe=await encryptDelivery(await source(),key);await expect(decryptDelivery(jwe,newRecoveryKey())).rejects.toThrow('Cannot open');for(const index of [0,2,3,4]){const parts=jwe.split('.');parts[index]=(parts[index]![0]==='A'?'B':'A')+parts[index]!.slice(1);await expect(decryptDelivery(parts.join('.'),key)).rejects.toThrow('Cannot open');}await expect(decryptDelivery(jwe.slice(0,-10),key)).rejects.toThrow('Cannot open');});
it('rejects unsupported algorithms and authenticated content of the wrong application type',async()=>{const key=newRecoveryKey(),raw=new TextEncoder().encode(JSON.stringify(await source()));for(const header of [{alg:'dir',enc:'A256GCM',typ:'different-app'},{alg:'dir',enc:'A128GCM',typ:'siteconnect-demo-delivery+jwe'}]){const bytes=base64url.decode(key);const jwe=await new CompactEncrypt(raw).setProtectedHeader(header).encrypt(header.enc==='A128GCM'?bytes.slice(0,16):bytes);await expect(decryptDelivery(jwe,key)).rejects.toThrow('Cannot open');}});
it('rejects oversized input and malformed keys before decryption',async()=>{await expect(decryptDelivery('x'.repeat(MAX_ENCRYPTED_BYTES+1),newRecoveryKey())).rejects.toThrow('size');await expect(decryptDelivery('invalid','short')).rejects.toThrow('43-character');});
it('detects an authenticated payload with inconsistent inner integrity',async()=>{const key=newRecoveryKey(),data=await source();data.payload.manifest.outputCount=999;const jwe=await encryptDelivery(data,key);await expect(decryptDelivery(jwe,key)).rejects.toThrow('Cannot open');});
