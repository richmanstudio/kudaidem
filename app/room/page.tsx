import { Topbar } from "@/components/topbar";
import { RoomClient } from "@/components/room-client";

type Props = { searchParams: Promise<Record<string,string|string[]|undefined>> };
export default async function RoomPage({ searchParams }: Props) {
  const sp = await searchParams;
  const place = typeof sp.place === "string" ? sp.place : "Brosko Bowling";
  return <div className="screen"><Topbar title="Комната"/><h1 className="room-title">Вечер Данилы</h1><div className="people">{["Данила","Аня","Серёжа","Лена"].map((name, i) => <div className="person" key={name}><div className="avatar">{["Д","А","С","Л"][i]}</div>{name}</div>)}</div><RoomClient initialPlace={place}/></div>;
}
