import { Topbar } from "@/components/ui/topbar";
import { RoomClient } from "@/features/rooms/components/room-client";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RoomPage({ searchParams }: Props) {
  const raw = await searchParams;
  const place = typeof raw.place === "string" && raw.place.trim()
    ? raw.place.trim().slice(0, 120)
    : "Brosko Bowling";

  return (
    <div className="screen">
      <Topbar title="Комната" />
      <h1 className="room-title">Вечер Данилы</h1>
      <div className="people">
        {["Данила", "Аня", "Серёжа", "Лена"].map((name, index) => (
          <div className="person" key={name}>
            <div className="avatar">{["Д", "А", "С", "Л"][index]}</div>
            {name}
          </div>
        ))}
      </div>
      <RoomClient initialPlace={place} />
    </div>
  );
}
