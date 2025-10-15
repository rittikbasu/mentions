import { create } from "zustand";
import { persist } from "zustand/middleware";

const useFavouritesStore = create(
  persist(
    (set, get) => ({
      ids: [],
      add: (id) =>
        set((state) =>
          state.ids.includes(id) ? state : { ids: [...state.ids, id] }
        ),
      remove: (id) =>
        set((state) => ({ ids: state.ids.filter((x) => x !== id) })),
      toggle: (id) => {
        const { ids } = get();
        if (ids.includes(id)) {
          set({ ids: ids.filter((x) => x !== id) });
        } else {
          set({ ids: [...ids, id] });
        }
      },
      clear: () => set({ ids: [] }),
    }),
    {
      name: "mentions-favourites",
      version: 1,
      migrate: (persistedState, version) => {
        // future migrations can transform state here
        return persistedState;
      },
    }
  )
);

export default useFavouritesStore;
