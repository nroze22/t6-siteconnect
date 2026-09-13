import {LayoutDashboard,ClipboardList,Database,ClipboardCheck,FileSearch,PackageCheck,History,ShieldCheck,BrainCircuit,Settings2,ChevronRight,type LucideIcon} from 'lucide-react';
import {destinations,useDataCountsNavigation,openDataCountsDestination,type DataCountsTab} from '@/lib/data-counts/navigation';
const icons:Record<DataCountsTab,LucideIcon>={'Overview':LayoutDashboard,'Request':ClipboardList,'Source records':Database,'Issues':ClipboardCheck,'Local AI':FileSearch,'Release & delivery':PackageCheck,'Activity':History,'Requirements':ShieldCheck,'Model setup':BrainCircuit,'System':Settings2};
const sections:{label:string;className:string;tabs:DataCountsTab[]}[]=[
 {label:'Release workflow',className:'dc-nav-workflow',tabs:['Request','Source records','Issues','Release & delivery']},
 {label:'Review tools',className:'dc-nav-tools',tabs:['Local AI','Activity']},
 {label:'Administration',className:'dc-nav-admin',tabs:['Model setup','System','Requirements']},
];
export function DataCountsNavigation(){
 const {tab}=useDataCountsNavigation();
 function item(key:DataCountsTab,step?:number){const d=destinations.find(d=>d.tab===key)!,Icon=icons[key],active=tab===key;return <button key={key} aria-label={d.label} title={d.hint} aria-current={active?'page':undefined} onClick={()=>openDataCountsDestination(key)}><Icon className="dc-nav-icon" size={18} aria-hidden="true"/><span className="dc-nav-label">{d.label}</span>{step!==undefined?<span className="dc-nav-step" aria-hidden="true">{step}</span>:active?<ChevronRight size={14} aria-hidden="true"/>:null}</button>;}
 return <nav className="dc-sidebar-nav" aria-label="Data operations"><div className="dc-nav-home">{item('Overview')}</div>{sections.map(section=><section className={section.className} key={section.label}><h2>{section.label}</h2>{section.tabs.map((key,index)=>item(key,section.className==='dc-nav-workflow'?index+1:undefined))}</section>)}</nav>;
}
