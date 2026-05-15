"use client";

import type { ReactNode } from "react";

type BusinessInfoTabProps = {
  isActive: boolean;
  children: ReactNode;
};

export default function BusinessInfoTab({
  isActive,
  children,
}: BusinessInfoTabProps) {
  return (
    <div className={isActive ? "mt-8 space-y-6" : "hidden"}>{children}</div>
  );
}
