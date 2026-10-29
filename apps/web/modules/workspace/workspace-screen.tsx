"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowUpIcon,
  EllipsisIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  ArchiveIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@workspace/ui/components/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import {
  AIConversation,
  AIConversationContent,
  AIConversationScrollButton,
} from "@workspace/ui/components/ai/conversation"
import {
  AIMessage,
  AIMessageContent,
} from "@workspace/ui/components/ai/message"
import { AIResponse } from "@workspace/ui/components/ai/response"
import {
  AIInput,
  AIInputTextarea,
  AIInputToolbar,
  AIInputSubmit,
} from "@workspace/ui/components/ai/input"
import { cn } from "@workspace/ui/lib/utils"
import {
  displayedMessages,
  type WorkspaceStore,
  type WorkspaceState,
} from "./model"

type Props = {
  state: WorkspaceState
  store: WorkspaceStore
  navigate: (id: string | null) => void
}
export function WorkspaceNavigation({
  state,
  store,
  navigate,
  identity,
  theme,
}: { identity?: ReactNode; theme?: ReactNode } & Props) {
  const { setOpenMobile } = useSidebar()
  const go = (id: string | null) => {
    setOpenMobile(false)
    navigate(id)
  }
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-4 px-4 py-5">
        <Link
          href="/conversations"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
          onClick={(event) => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
              event.preventDefault()
              go(null)
            }
          }}
        >
          <MessageSquareIcon className="size-5 text-primary" aria-hidden />
          <span>Conversations</span>
        </Link>
        <p className="text-xs text-muted-foreground">
          Your developer workspace
        </p>
        <Button
          onClick={async () => {
            if (await store.create()) setOpenMobile(false)
          }}
          disabled={
            state.account !== "ready" || state.creating || state.createUnknown
          }
          className="justify-start gap-2"
        >
          <PlusIcon className="size-4" aria-hidden />
          {state.creating ? "Creating…" : "New conversation"}
        </Button>
        <div
          className="flex gap-1 rounded-md border p-1"
          aria-label="Conversation status"
        >
          {(["active", "archived"] as const).map((filter) => (
            <Button
              key={filter}
              variant={state.filter === filter ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 text-xs capitalize"
              aria-pressed={state.filter === filter}
              onClick={() => store.filter(filter)}
            >
              {filter}
            </Button>
          ))}
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <nav aria-label="Your conversations">
          <SidebarMenu>
            {state.conversations.map((conversation) => (
              <SidebarMenuItem key={conversation.id}>
                <SidebarMenuButton
                  asChild
                  isActive={state.selectedId === conversation.id}
                  className="h-auto min-h-10 py-2"
                >
                  <Link
                    href={`/conversations/${conversation.id}`}
                    aria-current={
                      state.selectedId === conversation.id ? "page" : undefined
                    }
                    onClick={(event) => {
                      if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                        event.preventDefault()
                        go(conversation.id)
                      }
                    }}
                  >
                    <MessageSquareIcon
                      className="size-4 shrink-0"
                      aria-hidden
                    />
                    <span className="truncate">{conversation.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
        {state.account === "ready" &&
          !state.listLoading &&
          !state.listError &&
          !state.conversations.length && (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              {state.filter === "archived"
                ? "No archived conversations."
                : "Your conversations will appear here."}
            </p>
          )}
        {state.listLoading && (
          <p role="status" className="px-3 py-4 text-sm text-muted-foreground">
            Loading conversations…
          </p>
        )}
        {state.listError && (
          <div className="space-y-2 px-3 py-3">
            <p role="alert" className="text-sm text-destructive">
              {state.listError}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void store.refreshList()}
            >
              Refresh list
            </Button>
          </div>
        )}
        {state.listCursor && (
          <Button
            className="mx-1 my-2"
            variant="ghost"
            size="sm"
            disabled={state.listLoading}
            onClick={() => void store.moreConversations()}
          >
            Load more conversations
          </Button>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          {identity}
          <span className="ml-auto">{theme}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
const failureText: Record<string, string> = {
  provider_unavailable: "The response service is unavailable.",
  provider_error: "The response could not be completed.",
  timeout: "The response timed out.",
  context_limit:
    "This conversation has reached its context limit. Start a new conversation.",
  output_limit: "The response reached its output limit.",
  interrupted: "The response was interrupted.",
  expired: "The response was interrupted before it could finish.",
}
export function WorkspaceScreen({
  state,
  store,
  navigate,
}: {
  state: WorkspaceState
  store: WorkspaceStore
  navigate: (id: string | null) => void
}) {
  const [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState(""),
    [deleting, setDeleting] = useState(false),
    [now, setNow] = useState(() => Date.now())
  const conversation = state.conversation?.conversation,
    operation = state.conversation?.activeOperation,
    expired = !!operation && Date.parse(operation.expiresAt) <= now
  const expiresAt = operation?.expiresAt
  useEffect(() => {
    if (!expiresAt) return
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [expiresAt])
  const messages = displayedMessages(state),
    length = [...state.draft].length
  const waiting =
    !!operation ||
    (!!state.admission &&
      !["completed", "failed", "interrupted"].includes(state.admission.status))
  const canSend =
    state.account === "ready" &&
    state.phase === "live" &&
    conversation?.status === "active" &&
    !waiting &&
    !state.intent &&
    !state.sending &&
    !!state.draft.trim() &&
    length <= 16000
  const phaseText =
    state.phase === "live"
      ? "Connected"
      : state.phase === "reconciling"
        ? "Recovering your conversation…"
        : state.phase === "connecting"
          ? "Connecting…"
          : state.phase === "disconnected"
            ? "Connection lost. Reconnecting…"
            : ""
  const back = () => navigate(null)
  return (
    <>
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <SidebarTrigger aria-label="Toggle conversations sidebar" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            {conversation?.title ?? "Conversations"}
          </h1>
          {conversation?.status === "archived" && (
            <p className="text-xs text-muted-foreground">
              Archived conversation
            </p>
          )}
        </div>
        {state.selectedId && phaseText && (
          <p
            role="status"
            aria-live="polite"
            className="hidden text-xs text-muted-foreground sm:block"
          >
            {phaseText}
          </p>
        )}
        {conversation && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Conversation actions"
                variant="ghost"
                size="icon"
              >
                <EllipsisIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setTitle(conversation.title)
                  setRenaming(true)
                }}
              >
                <PencilIcon className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={state.changing}
                onSelect={() =>
                  void store.change({
                    status:
                      conversation.status === "active" ? "archived" : "active",
                  })
                }
              >
                <ArchiveIcon className="size-4" />
                {conversation.status === "active" ? "Archive" : "Unarchive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setDeleting(true)}
                className="text-destructive"
              >
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      {state.account === "loading" ? (
        <div className="grid flex-1 place-content-center px-6">
          <p role="status" className="text-sm text-muted-foreground">
            Loading your workspace…
          </p>
        </div>
      ) : state.account === "error" ? (
        <div className="grid flex-1 place-content-center gap-4 px-6 text-center">
          <p role="alert">{state.error}</p>
          <Button
            onClick={() => {
              store.stop()
              void store.start()
            }}
          >
            Try again
          </Button>
        </div>
      ) : !state.selectedId ? (
        <div className="mx-auto grid w-full max-w-xl flex-1 content-center gap-5 px-6 pb-20">
          <MessageSquareIcon className="size-9 text-primary" aria-hidden />
          <h2 className="text-3xl font-semibold tracking-tight">
            A place to keep thinking.
          </h2>
          <p className="max-w-md text-muted-foreground">
            Start a conversation, work through a question, and pick it up later
            with your context intact.
          </p>
          <Button
            className="w-fit gap-2"
            disabled={state.creating || state.createUnknown}
            onClick={() => void store.create()}
          >
            <PlusIcon className="size-4" aria-hidden />
            New conversation
          </Button>
          {state.listError && (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {state.listError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void store.refreshList()}
              >
                Refresh list
              </Button>
            </div>
          )}
        </div>
      ) : state.phase === "unavailable" ? (
        <div className="grid flex-1 place-content-center gap-4 px-6 text-center">
          <h2 className="text-xl font-semibold">Conversation unavailable</h2>
          <p className="text-sm text-muted-foreground">
            It may have been deleted or belong to another account.
          </p>
          <Button onClick={back}>Back to conversations</Button>
        </div>
      ) : (
        <>
          {state.phase !== "live" && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
              <p role="status">{phaseText || "Checking your conversation…"}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => store.reconnect()}
              >
                <RefreshCwIcon className="mr-2 size-3" aria-hidden />
                Reconnect
              </Button>
            </div>
          )}
          <AIConversation
            aria-label="Conversation history"
            aria-live="off"
            className="min-h-0"
          >
            <AIConversationContent className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 md:px-8">
              {(state.olderLoaded
                ? state.olderCursor
                : state.conversation?.nextCursor) && (
                <div className="text-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void store.older()}
                    disabled={state.olderLoading || state.phase !== "live"}
                  >
                    {state.olderLoading
                      ? "Loading earlier messages…"
                      : "Load earlier messages"}
                  </Button>
                </div>
              )}
              {state.olderError && (
                <p
                  role="alert"
                  className="text-center text-sm text-destructive"
                >
                  {state.olderError}
                </p>
              )}
              {!messages.length && state.phase === "live" && (
                <div className="py-16 text-center">
                  <h2 className="text-xl font-medium">
                    What are you working through?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask a question or start with an idea.
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <article
                  key={message.id}
                  data-message-id={message.id}
                  aria-label={
                    message.role === "user"
                      ? "Your message"
                      : "Assistant response"
                  }
                >
                  <AIMessage from={message.role} className="items-start">
                    <AIMessageContent
                      className={cn(
                        "min-w-0 [overflow-wrap:anywhere]",
                        message.role === "assistant" &&
                          "w-full border-0 bg-transparent px-0",
                        ["failed", "interrupted"].includes(message.state) &&
                          "border-destructive/40"
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                        <span>
                          {message.role === "user" ? "You" : "Assistant"}
                        </span>
                        {message.modality === "voice" && (
                          <span className="rounded border px-1 text-[10px]">
                            Voice
                          </span>
                        )}
                        {message.state === "streaming" && (
                          <span className="text-muted-foreground">
                            Responding…
                          </span>
                        )}
                      </div>
                      {message.content ? (
                        <AIResponse className="text-sm leading-7 [&_code]:font-mono [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3">
                          {message.content}
                        </AIResponse>
                      ) : ["pending", "streaming"].includes(message.state) ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2Icon
                            className="size-3 animate-spin"
                            aria-hidden
                          />
                          Waiting for a response…
                        </p>
                      ) : null}
                      {["failed", "interrupted"].includes(message.state) && (
                        <div className="mt-3 space-y-2">
                          <p className="text-sm text-destructive">
                            {failureText[message.failureCode ?? ""] ??
                              "This response was interrupted."}
                          </p>
                          {message.modality === "text" &&
                            message.operationId && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  state.sending ||
                                  !!state.intent ||
                                  waiting ||
                                  state.phase !== "live" ||
                                  conversation?.status !== "active"
                                }
                                onClick={() =>
                                  store.retry(message.operationId!)
                                }
                              >
                                Retry response
                              </Button>
                            )}
                        </div>
                      )}
                    </AIMessageContent>
                  </AIMessage>
                </article>
              ))}
              {waiting && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <p role="status">
                    {expired
                      ? "This response needs recovery."
                      : "A response is in progress…"}
                  </p>
                  {expired && operation && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        state.sending ||
                        !!state.intent ||
                        state.phase !== "live"
                      }
                      onClick={() => store.retry(operation.operationId)}
                    >
                      Recover response
                    </Button>
                  )}
                </div>
              )}
            </AIConversationContent>
            <AIConversationScrollButton />
          </AIConversation>
          <div className="mx-auto w-full max-w-4xl shrink-0 space-y-3 px-4 pb-4 md:px-8 md:pb-6">
            {state.commandError && (
              <p role="alert" className="text-sm text-destructive">
                {state.commandError}
              </p>
            )}
            {state.intent && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-sm">
                  {state.sending
                    ? "Checking delivery…"
                    : "This request is waiting for confirmation."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={state.sending}
                  onClick={() => store.checkDelivery()}
                >
                  Check delivery
                </Button>
              </div>
            )}
            {conversation?.status === "archived" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <p className="text-sm text-muted-foreground">
                  Unarchive this conversation to continue.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={state.changing}
                  onClick={() => void store.change({ status: "active" })}
                >
                  Unarchive
                </Button>
              </div>
            ) : (
              <AIInput
                onSubmit={(event) => {
                  event.preventDefault()
                  store.send()
                }}
              >
                <Label htmlFor="conversation-message" className="sr-only">
                  Message
                </Label>
                <AIInputTextarea
                  id="conversation-message"
                  placeholder="Ask a question or share an idea…"
                  value={state.draft}
                  onChange={(event) => store.setDraft(event.target.value)}
                  disabled={!!state.intent}
                  aria-describedby="message-help"
                  aria-invalid={length > 16000}
                />
                <AIInputToolbar>
                  <span
                    id="message-help"
                    className={cn(
                      "px-2 text-[11px] text-muted-foreground",
                      length > 16000 && "text-destructive"
                    )}
                  >
                    {length > 14000
                      ? `${length.toLocaleString()} / 16,000 characters`
                      : "Ctrl / ⌘ + Enter to send"}
                  </span>
                  <AIInputSubmit
                    disabled={!canSend}
                    aria-label="Send message"
                    className="px-3"
                    size="default"
                  >
                    <ArrowUpIcon className="size-4" aria-hidden />
                    <span>Send</span>
                  </AIInputSubmit>
                </AIInputToolbar>
              </AIInput>
            )}
          </div>
        </>
      )}
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              Choose a short title you can recognize later.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              if (
                title.trim() &&
                [...title].length <= 120 &&
                (await store.change({ title }))
              )
                setRenaming(false)
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="conversation-title">Title</Label>
              <Input
                id="conversation-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-describedby="title-help"
              />
              <p id="title-help" className="text-xs text-muted-foreground">
                Up to 120 characters.
              </p>
            </div>
            {state.commandError && (
              <p role="alert" className="text-sm text-destructive">
                {state.commandError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  state.changing || !title.trim() || [...title].length > 120
                }
              >
                Save title
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation will be removed from your workspace. You cannot
              reopen it afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state.commandError && (
            <p role="alert" className="text-sm text-destructive">
              {state.commandError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={state.changing}
              onClick={async (event) => {
                event.preventDefault()
                if (await store.remove()) setDeleting(false)
              }}
            >
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
