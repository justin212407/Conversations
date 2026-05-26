"use client"

import { Authenticated, Unauthenticated } from "convex/react";
import { useMutation, useQuery } from "convex/react";
import { SignInButton, UserButton } from "@clerk/nextjs";
import {api} from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button";
import { add } from "@workspace/backend/users";

export default function Page() {
  const users = useQuery(api.users.getMany)
  const addUser = useMutation(api.users.add)

  return (
    <>

        <Authenticated>
          <div className="max-w-sm w-full mx-auto">
            <p> apps/web </p>
            <UserButton />
            <Button onClick={() =>{addUser()}}>Add</Button>
            {JSON.stringify(users, null, 2)}
          </div>
        </Authenticated>
        <Unauthenticated>
          <p>Must be signed in!!</p>
          <SignInButton>Sign in!</SignInButton>
          </Unauthenticated>
    </>
  )
}
