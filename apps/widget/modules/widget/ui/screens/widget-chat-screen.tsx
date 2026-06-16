"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { AlertTriangleIcon, ArrowLeftIcon, MenuIcon } from "lucide-react"
import { contactSessionIdAtomFamily, conversationIdAtom, errorMessageAtom, organizationIdAtom, screenAtom } from "../../atoms/widget-atoms"
import { WidgetHeader } from "../components/widget-header"
import { Button } from "@workspace/ui/components/button"
import { useQuery } from "convex/react"
import { api } from "@workspace/backend/_generated/api"

export const WidgetChatScreen = () => {
    const setScreen = useSetAtom(screenAtom);
    const setConversationId = useSetAtom(conversationIdAtom)

    const conversationId = useAtomValue(conversationIdAtom);
    const organizationId = useAtomValue(organizationIdAtom);
    const contactSessionId = useAtomValue(contactSessionIdAtomFamily(organizationId || ""));

    const conversation = useQuery(
        api.public.conversations.getOne,
        conversationId && contactSessionId ? {
            conversationId, 
            contactSessionId
        } : "skip"    
    );

    const onBack = () => {
        setConversationId(null);
        setScreen("selection");
    }

    return(
        <>
        <WidgetHeader className="flex items-center justify-between">
            <div className="flex items-center gap-x-2">
                <Button size="icon" variant="transparent" onClick={onBack}>

                    <ArrowLeftIcon />
                </Button>
                <p> Chat </p>
            </div>
            <Button><MenuIcon /></Button>
        </WidgetHeader>
        <div className="flex flex-1 flex-col gap-y-4 p-4">
            <p className="text-sm">
                {JSON.stringify(conversation)}
            </p>
        </div>
        </>
    )
}