"use client";

import type { ReactNode } from "react";

type DesignTabProps = {
  isActive: boolean;
  children: ReactNode;
};

export default function DesignTab({ isActive, children }: DesignTabProps) {
  return (
    <div className={isActive ? "mt-8 space-y-6" : "hidden"}>{children}</div>
  );
}
