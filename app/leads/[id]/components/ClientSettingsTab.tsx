"use client";

import type { ReactNode } from "react";

type ClientSettingsTabProps = {
  isActive: boolean;
  children: ReactNode;
};

export default function ClientSettingsTab({
  isActive,
  children,
}: ClientSettingsTabProps) {
  return <div className={isActive ? "" : "hidden"}>{children}</div>;
}
