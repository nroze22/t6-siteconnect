import {destinations,useDataCountsNavigation,openDataCountsDestination} from '@/lib/data-counts/navigation';
export function DataCountsNavigation(){
 const {tab}=useDataCountsNavigation();
 return <nav className="dc-sidebar-nav" aria-label="Data operations">{['Data operations','Site administration'].map(group=><section key={group}><h2>{group}</h2>{destinations.filter(d=>d.group===group).map(d=><button key={d.tab} aria-label={d.label} title={d.hint} aria-current={tab===d.tab?'page':undefined} onClick={()=>openDataCountsDestination(d.tab)}><span>{d.label}</span><small>{d.hint}</small></button>)}</section>)}</nav>;
}
