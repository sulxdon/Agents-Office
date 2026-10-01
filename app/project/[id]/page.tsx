import OfficeHome from "@/components/OfficeHome";

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <OfficeHome projectId={params.id} />;
}
