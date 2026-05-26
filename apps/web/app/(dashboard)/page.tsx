"use client"

import { useMutation, useQuery } from "convex/react";
import { OrganizationSwitcher, SignInButton, UserButton } from "@clerk/nextjs";
import {api} from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button";

export default function Page() {
  const users = useQuery(api.users.getMany)
  const addUser = useMutation(api.users.add)

  return (
    <>
          <div className="max-w-sm w-full mx-auto">
            <p> apps/web </p>
            <UserButton />
            <OrganizationSwitcher hidePersonal/>
            <Button onClick={() =>{addUser()}}>Add</Button>
            {JSON.stringify(users, null, 2)}
          </div>
    </>
  )
}
