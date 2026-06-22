import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/lib/api";

export type Trip = {
  trip_id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  cover_image: string | null;
  trip_type: "solo" | "group" | "family";
  invite_code: string;
  admin_id: string;
  storage_provider: { provider: string; account_label: string; folder_url?: string } | null;
  status: "upcoming" | "past";
  member_count: number;
  my_role: "admin" | "member" | "viewer";
};

export type Member = {
  user_id: string;
  name: string | null;
  avatar: string | null;
  email: string | null;
  role: "admin" | "member" | "viewer";
  family_head_id: string | null;
};

type TripState = {
  tripId: string;
  trip: Trip | null;
  members: Member[];
  loading: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  memberName: (userId: string) => string;
  memberById: (userId: string) => Member | undefined;
};

const TripContext = createContext<TripState>({} as TripState);
export const useTrip = () => useContext(TripContext);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = String(id);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        api<{ trip: Trip }>(`/trips/${tripId}`),
        api<{ members: Member[] }>(`/trips/${tripId}/members`),
      ]);
      setTrip(t.trip);
      setMembers(m.members);
    } catch (e) {
      // handled upstream
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const memberName = useCallback(
    (userId: string) => members.find((m) => m.user_id === userId)?.name || "Member",
    [members]
  );
  const memberById = useCallback(
    (userId: string) => members.find((m) => m.user_id === userId),
    [members]
  );

  const canEdit = trip?.my_role === "admin" || trip?.my_role === "member";
  const isAdmin = trip?.my_role === "admin";

  return (
    <TripContext.Provider
      value={{ tripId, trip, members, loading, canEdit, isAdmin, refresh, memberName, memberById }}
    >
      {children}
    </TripContext.Provider>
  );
}
