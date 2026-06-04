import Vapi from "@vapi-ai/web"
import { useEffect, useState } from "react"

interface TranscriptMessage {
    role: "user" | "assistant";
    text: string;
}

export const useVapi = () => {
    const [vapi, setVapi] = useState<Vapi | null>(null)
    const [connected, setIsConnected] = useState(false);
    const [connecting, setIsConnecting] = useState(false);
    const [speaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState(<TranscriptMessage[]>([]));

    useEffect (() => {
        // Only for testing the Vapi API, otherwise customers will provide their own API keys
        const vapiInstance = new Vapi("a3ac893f-3c77-4c1f-8857-50be5f8869b2");
        setVapi(vapiInstance);

        vapiInstance.on("call-start", () => {
            setIsConnected(true);
            setIsConnecting(false);
            setTranscript([]);
        });

        vapiInstance.on("call-end", () => {
            setIsConnected(false);
            setIsConnecting(false);
            setIsSpeaking(false);
        });

        vapiInstance.on("speech-start", () => {
            setIsSpeaking(true);
        });

        vapiInstance.on("speech-end", () => {
            setIsSpeaking(false);
        });

    }, [])
}

