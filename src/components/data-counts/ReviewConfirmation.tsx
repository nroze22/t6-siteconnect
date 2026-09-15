import {useEffect,useRef} from 'react';
export type ReviewAction={title:string;detail:string;label:string;run:()=>void};
export function ReviewConfirmation({action,onClose}:{action:ReviewAction;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{dialog.current?.showModal();cancel.current?.focus();},[]);
 return <dialog className="dc-confirm-dialog" ref={dialog} aria-labelledby="review-confirm-title" onCancel={e=>{e.preventDefault();onClose();}}><h2 id="review-confirm-title">{action.title}</h2><p>{action.detail}</p><div className="dc-actions"><button ref={cancel} className="dc-btn" onClick={onClose}>Keep reviewing</button><button className="dc-btn primary" onClick={()=>{onClose();action.run();}}>{action.label}</button></div></dialog>;
}
