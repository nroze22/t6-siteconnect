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
