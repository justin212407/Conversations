"use client"

import { useMutation, useQuery } from "convex/react";
import {api} from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button";

export default function Page() {
  const users = useQuery(api.users.getMany)
  const addUser = useMutation(api.users.add)

  return (
    <div className="flex flex-col min-h-svh p-6">
        
        <div className="max-w-sm w-full mx-auto">
          <Button onClick={() =>{addUser()}}>Add</Button>
          <p> apps/widget </p>
          {JSON.stringify(users, null, 2)}
        </div>
      </div>
  )
}
