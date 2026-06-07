import Vapi from "@vapi-ai/web"
import { useEffect, useState } from "react"

interface TranscriptMessage {
    role: "user" | "assistant";
    text: string;
}

export const useVapi = () => {
    const [vapi, setVapi] = useState<Vapi | null>(null)
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState(<TranscriptMessage[]>([]));
    useEffect(() => {
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

        vapiInstance.on("error", (error) => {
            console.log(error, "VAPI_ERROR");
            setIsConnecting(false);
        });

        vapiInstance.on("message", (message) => {
            if (message.type === "transcript"&& message.transcriptType === "final"){
                setTranscript((prev) => [
                    ...prev,
                    {
                        role: message.role === "user" ? "user" : "assistant",
                        text: message.transcript,
                    }
                ])
            } 
        })
        return () => {
            vapiInstance?.stop();
        }
    }, [])
    const startCall = () => {
            setIsConnecting(true);

            if (vapi) {
                // Only for testing the Vapi API, otherwise customers will provide their own Assistant IDs
                vapi.start("bf8bc49f-7ea1-45d1-9256-be4f08cd8b4c")
            }
        }

    const endCall = () => {
        if (vapi) {
            vapi.stop()
        }
    }

    return {
        isSpeaking,
        isConnected,
        isConnecting,
        transcript, 
        startCall,
        endCall
    }
}

