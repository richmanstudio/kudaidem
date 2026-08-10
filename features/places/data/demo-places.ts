import type { Place } from "@/features/recommendations/domain/types";

/**
 * Temporary seed data for Stage 1.
 * Stage 2 replaces this module with a verified Khabarovsk data source.
 */
export const demoPlaces: Place[] = [
  { id: "brosko-bowling", city: "Хабаровск", name: "Brosko Bowling", category: "Боулинг · Развлечения", tags: ["fun", "active", "surprise"], minParty: 2, maxParty: 8, price: 1400, duration: 120, closesAt: "02:00", description: "Динамичный вариант для компании: дорожки, еда и достаточно времени, чтобы вечер не закончился после одного часа.", travelMinutes: 12, accent: "BOWLING", isActive: true },
  { id: "dom", city: "Хабаровск", name: "DOM", category: "Ресторан · Бар", tags: ["eat", "calm", "surprise"], minParty: 2, maxParty: 6, price: 1600, duration: 110, closesAt: "01:00", description: "Спокойный сценарий для ужина и длинного разговора без перегруженной программы.", travelMinutes: 8, accent: "DINNER", isActive: true },
  { id: "kinoprostranstvo", city: "Хабаровск", name: "Кинопространство", category: "Кино · Отдых", tags: ["calm", "surprise"], minParty: 2, maxParty: 5, price: 850, duration: 150, closesAt: "00:30", description: "Подойдёт, когда хочется минимум организационных решений и понятный вечер на пару часов.", travelMinutes: 10, accent: "CINEMA", isActive: true },
  { id: "quest-room", city: "Хабаровск", name: "Квест-комната", category: "Квест · Команда", tags: ["fun", "active", "surprise"], minParty: 3, maxParty: 6, price: 1200, duration: 90, closesAt: "23:30", description: "Сценарий, который быстро вовлекает всю компанию и не требует придумывать, чем заняться дальше.", travelMinutes: 15, accent: "QUEST", isActive: true },
  { id: "karaoke", city: "Хабаровск", name: "Karaoke Room", category: "Караоке · Музыка", tags: ["fun", "surprise"], minParty: 2, maxParty: 8, price: 1900, duration: 150, closesAt: "04:00", description: "Для громкого вечера и компании, которой важнее эмоции, чем спокойная посадка за столом.", travelMinutes: 14, accent: "KARAOKE", isActive: true },
  { id: "coffee-walk", city: "Хабаровск", name: "Coffee & Walk", category: "Кофе · Прогулка", tags: ["calm", "eat"], minParty: 2, maxParty: 5, price: 650, duration: 80, closesAt: "23:00", description: "Лёгкий вариант без большой траты: кофе, разговор и прогулка по центру.", travelMinutes: 6, accent: "COFFEE", isActive: true },
  { id: "game-club", city: "Хабаровск", name: "Game Club", category: "Игры · Команда", tags: ["fun", "active"], minParty: 2, maxParty: 5, price: 900, duration: 120, closesAt: "24/7", description: "Быстрый вариант для компании, если хочется соревноваться и не зависеть от погоды.", travelMinutes: 9, accent: "GAMES", isActive: true },
  { id: "billiards", city: "Хабаровск", name: "Billiards Club", category: "Бильярд · Бар", tags: ["fun", "calm"], minParty: 2, maxParty: 6, price: 1100, duration: 120, closesAt: "02:00", description: "Неспешный соревновательный вечер, который одинаково работает для двух человек и небольшой компании.", travelMinutes: 11, accent: "BILLIARDS", isActive: true },
];
