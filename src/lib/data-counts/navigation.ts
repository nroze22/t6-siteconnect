import {create} from 'zustand';
export const destinations=[
 {tab:'Overview',label:'Overview',hint:'Current request and next action',group:'Data operations'},
 {tab:'Request',label:'Requests',hint:'Scope and specification checks',group:'Data operations'},
 {tab:'Source records',label:'Source records',hint:'Original values and provenance',group:'Data operations'},
 {tab:'Issues',label:'Quality review',hint:'Resolve source blockers',group:'Data operations'},
 {tab:'Local AI',label:'Document review',hint:'Extract facts and inspect evidence',group:'Data operations'},
 {tab:'Release & delivery',label:'Release & delivery',hint:'Review, approve and reconcile',group:'Data operations'},
 {tab:'Activity',label:'Activity',hint:'Processing and receipt history',group:'Data operations'},
 {tab:'Requirements',label:'Production readiness',hint:'Requirements and integration gaps',group:'Site administration'},
 {tab:'Model setup',label:'Model setup',hint:'Local model and reader setup',group:'Site administration'},
 {tab:'System',label:'System & support',hint:'Storage, recovery and operations',group:'Site administration'},
] as const;
export type DataCountsTab=typeof destinations[number]['tab'];
export const useDataCountsNavigation=create<{tab:DataCountsTab;setTab:(tab:DataCountsTab)=>void}>(set=>({tab:'Overview',setTab:tab=>set({tab})}));
export const destinationTitle=(tab:DataCountsTab)=>destinations.find(d=>d.tab===tab)!.label;

export function openDataCountsDestination(tab:DataCountsTab){useDataCountsNavigation.getState().setTab(tab);window.dispatchEvent(new Event('data-counts-open-destination'));}

export const destinationDescription:Record<DataCountsTab,string>={
 'Overview':'Your current laboratory request, processing status and next decision.',
 'Request':'Confirm the cohort, source systems, dates and exact requested fields.',
 'Source records':'Inspect original values and provenance before running quality checks.',
 'Issues':'Resolve missing or inconsistent source data before preparing a release.',
 'Release & delivery':'Review counts, exclusions and changes. Approve the exact package before export.',
 'Activity':'Reconcile processing counts and resolve outstanding simulated receipts.',
 'Local AI':'Open a document, review extracted facts and verify each value against its source.',
 'Model setup':'Prepare local extraction, then return to your document.',
 'System':'Manage local storage, recovery, maintenance and support.',
 'Requirements':'Track each RFI requirement, remaining integration work and acceptance evidence.',
};
