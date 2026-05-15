"use client";

import type { ReactNode } from "react";

type CommunicationTabProps = {
  isActive: boolean;
  children: ReactNode;
};

export default function CommunicationTab({
  isActive,
  children,
}: CommunicationTabProps) {
  return (
    <div className={isActive ? "mt-8 space-y-6" : "hidden"}>{children}</div>
  );
}
