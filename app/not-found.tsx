import { EmptyState } from "@/components/ui/screen-state";

export default function NotFound() {
  return (
    <EmptyState
      title="Такого экрана нет"
      description="Возможно, ссылка устарела или место больше не участвует в подборе."
    />
  );
}
