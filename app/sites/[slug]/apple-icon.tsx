import { getSiteIconResponse } from "./siteIcon";

export const dynamic = "force-dynamic";

export default async function AppleIcon({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return getSiteIconResponse(slug);
}
