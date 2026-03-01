"use client";

import { create } from "zustand";

const MAX_NOTIFICATIONS = 3;

export type SupportNotification = {
  id: string;
  body: string;
  createdAt: string;
};

type State = {
  notifications: SupportNotification[];
  addNotification: (n: Omit<SupportNotification, "id">) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
};

export const useSupportNotificationsStore = create<State>((set) => ({
  notifications: [],
  addNotification: (n) =>
    set((state) => {
      const id = `sn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const next = [...state.notifications, { ...n, id }].slice(-MAX_NOTIFICATIONS);
      return { notifications: next };
    }),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),
  clearAllNotifications: () => set({ notifications: [] })
}));
