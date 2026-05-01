import LeadDetailClient from "./LeadDetailClient";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;

  return <LeadDetailClient slug={id} />;
}
