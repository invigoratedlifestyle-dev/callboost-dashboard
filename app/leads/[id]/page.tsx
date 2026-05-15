import LeadDetailClient from "./LeadDetailClient";
import { Suspense } from "react";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <LeadDetailClient slug={id} />
    </Suspense>
  );
}
