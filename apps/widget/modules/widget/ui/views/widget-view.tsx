"use client";

import { useAtomValue } from "jotai";
import { WidgetAuthScreen } from "../screens/widget-auth-screen";
import { screenAtom } from "../../atoms/widget-atoms";

interface Props {
  organizationId: string;
};

export const WidgetView = ({ organizationId }: Props) => {
  const screen = useAtomValue(screenAtom);
  
  const screenComponents = {
    error: <p>TODO</p>,
    loading: <p>TODO</p>,
    auth: <WidgetAuthScreen />,
    voice: <p>TODO</p>,
    inbox: <p>TODO</p>,
    selection: <p>TODO</p>,
    chat: <p>TODO</p>,
    contact: <p>TODO</p>,
  }

  return (
    // TODO: Confirm whether or not "min-h-screen" and "min-w-screen" is needed
    <main className="min-h-screen min-w-screen flex h-full w-full flex-col overflow-hidden rounded-xl border bg-muted">
      {screenComponents[screen]}
    </main>
  );
};