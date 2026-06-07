"use client"

import { useVapi } from "@/modules/widget/hooks/use-vapi";
import { Button } from "@workspace/ui/components/button";

export default function Page() {
  const {
      isSpeaking,
      isConnected,
      isConnecting,
      transcript, 
      startCall,
      endCall
      } = useVapi();
  return (
    <div className="flex flex-col min-h-svh max-w-md mx-auto w-full">
        
        <div className="max-w-sm w-full mx-auto">
          <Button onClick={() =>{startCall()}}>Start Call</Button>
          <Button onClick={() =>{endCall()}} variant="destructive">End Call</Button>
          <p>isConnected:{`${isConnected}`}</p>
          <p>isSpeaking:{`${isSpeaking}`}</p>
          <p>isConnecting:{`${isConnecting}`}</p>
          <p>{JSON.stringify(transcript, null, 2)}</p>
        </div>
      </div>
  )
}
