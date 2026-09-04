import { StundenCockpit } from "@/components/stunden-cockpit";

// In Next 16 sind searchParams ein Promise. Die Seite reicht nur das
// optionale block-Param an die Client-Komponente durch, die alles Weitere
// ueber /api/stunde laedt.
export default async function StundePage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string }>;
}) {
  const { block } = await searchParams;
  return <StundenCockpit block={block ?? null} />;
}
