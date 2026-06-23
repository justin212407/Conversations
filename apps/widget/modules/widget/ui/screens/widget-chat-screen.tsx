"use client"

import { zodResolver } from "@hookform/resolvers/zod";
import {z} from "zod";
import {Form, FormField} from "@workspace/ui/components/form";
import {useThreadMessages, toUIMessages} from "@convex-dev/agent/react" 
import { useAtomValue, useSetAtom } from "jotai";
import { AlertTriangleIcon, ArrowLeftIcon, MenuIcon } from "lucide-react";
import { contactSessionIdAtomFamily, conversationIdAtom, errorMessageAtom, organizationIdAtom, screenAtom } from "../../atoms/widget-atoms";
import { WidgetHeader } from "../components/widget-header";
import { Button } from "@workspace/ui/components/button";
import { useAction, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {AIConversation, AIConversationContent, AIConversationScrollButton} from "@workspace/ui/components/ai/conversation";
import  {AIInput, AIInputSubmit, AIInputTextarea, AIInputToolbar, AIInputTools} from "@workspace/ui/components/ai/input";
import  {AIMessage, AIMessageContent} from "@workspace/ui/components/ai/message";
import {AIResponse} from "@workspace/ui/components/ai/response";
import {AISuggestion, AISuggestions} from "@workspace/ui/components/ai/suggestion";
import { useForm } from "react-hook-form";

const formSchema = z.object({
    message: z.string().min(1, "Message is required"),
})

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
    };

    const messages = useThreadMessages(
        api.public.messages.getMany,
        conversation?.threadId && contactSessionId?{
            threadId: conversation.threadId,
            contactSessionId
        }: "skip",
        {initialNumItems: 10}
    )

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            message:"",
        },
    });

    const createMessage = useAction(api.public.messages.create);
    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        if (!conversation || !contactSessionId){
            return;
        }

        form.reset();

        await createMessage({
            threadId: conversation.threadId,
            prompt: values.message,
            contactSessionId
        });
    };

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
            <AIConversation>
                <AIConversationContent>
                    {toUIMessages(messages.results ?? [])?.map((message) => {
                        return (
                            <AIMessage 
                                from = {message.role === "user" ? "user" : "assistant"}
                                key = {message.id}>
                                <AIMessageContent>
                                    <AIResponse>{message.content}</AIResponse>
                                </AIMessageContent>
                                {/*TODO: Add Avatar component */}
                            </AIMessage>
                        )
                    })}
                </AIConversationContent>
            </AIConversation>
            {/*TODO: Add Suggestions */}
            <Form {...form}>
                <AIInput 
                className="rounded-none border-x-0 border-b-0"
                onSubmit={form.handleSubmit(onSubmit)}>
                    <FormField 
                        control={form.control}
                        disabled={conversation?.status === "resolved"}
                        name = "message"
                        render = {({field}) => (
                            <AIInputTextarea
                                disabled={conversation?.status === "resolved"}
                                onChange={field.onChange}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey){
                                        e.preventDefault();
                                        form.handleSubmit(onSubmit)();
                                    }
                                }}
                                placeholder={conversation?.status === "resolved" ? "This conversation has been resolved" : "Type your message"}
                                value = {field.value}
                                />
                                )}
                                /> 
                                <AIInputToolbar>
                                    <AIInputTools>
                                        <AIInputSubmit 
                                        disabled= {conversation?.status === "resolved" || !form.formState.isValid}
                                        status="ready"
                                        type="submit">
                                        </AIInputSubmit>                                     
                                    </AIInputTools>
                                </AIInputToolbar>      
                </AIInput>
            </Form>
        </div>
        </>
    )
}