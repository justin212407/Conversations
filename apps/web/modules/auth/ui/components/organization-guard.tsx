"use client"

import { useOrganization } from "@clerk/nextjs"
import { AuthLayout } from "@/modules/auth/ui/layouts/auth-layout"
import { OrgSelectionView } from "../views/org-selection-view";

export const OrganizationGuard = ({children}: {children: React.ReactNode}) => {
    const {organization} = useOrganization();

    if (!organization){
        <AuthLayout>
            <OrgSelectionView />
        </AuthLayout>
    }

    return (
        <>
            {children}
        </>
    );
}
 
