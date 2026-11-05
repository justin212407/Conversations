import { notFound } from "next/navigation"
import { WorkspacePage } from "@/modules/workspace/page"
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound()
  return <WorkspacePage conversationId={id.toLowerCase()} />
}
