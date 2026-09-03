import { BotVerlaufDetail } from "@/components/bot-verlauf-detail";

// In Next 16 sind Route-Params ein Promise. Die Seite reicht nur die id an die
// Client-Komponente durch, gleiches Muster wie app/faecher/[id]/page.tsx.
export default async function BotVerlaufDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BotVerlaufDetail id={id} />;
}
