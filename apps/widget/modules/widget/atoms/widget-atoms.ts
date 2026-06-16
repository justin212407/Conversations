import { atom } from "jotai";
import {atomWithStorage} from "jotai/utils"
import { atomFamily } from 'jotai-family'
import { WidgetScreen } from "../types";
import { CONTACT_SESSION_KEY } from "../contants";
import { Id } from "@workspace/backend/_generated/dataModel";

// Basic widget state atom
export const screenAtom = atom<WidgetScreen>("loading");
export const organizationIdAtom = atom<string | null>(null)

// Organization-scoped contact session atom
export const  contactSessionIdAtomFamily = atomFamily((organizationId: string) => 
    {return atomWithStorage<Id<"contactSessions">| null>(`${CONTACT_SESSION_KEY}_${organizationId}`, null)})

export const errorMessageAtom = atom<string | null>(null)
export const loadingMessageAtom = atom<string | null>(null)