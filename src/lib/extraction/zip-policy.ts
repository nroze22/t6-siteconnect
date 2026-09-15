/** Reject oversized Office containers before decompressing their document parts. */
export function checkOfficeZip(bytes:ArrayBuffer){
 const v=new DataView(bytes);let eocd=-1;
 for(let n=v.byteLength-22;n>=Math.max(0,v.byteLength-65557);n--)if(v.getUint32(n,true)===0x06054b50){eocd=n;break;}
 if(eocd<0)throw Error('Invalid Office ZIP container.');
 const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true);if(count===65535||p===0xffffffff||count>4000)throw Error('Office archive is too large or uses unsupported ZIP64.');let expanded=0;
 for(let i=0;i<count;i++){if(p+46>v.byteLength||v.getUint32(p,true)!==0x02014b50)throw Error('Invalid Office archive directory.');if(v.getUint16(p+8,true)&1)throw Error('Encrypted Office archives are not supported.');expanded+=v.getUint32(p+24,true);if(expanded>32*1024*1024)throw Error('Expanded Office content exceeds 32 MB. Split the file.');p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);}
}
