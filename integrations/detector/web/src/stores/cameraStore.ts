import { create } from 'zustand';

export interface Camera {
  id: string;
  name: string;
  type: string;
  address: string | number;
  status?: string;
  go2rtcId?: string;
  [key: string]: unknown;
}

interface CameraState {
  cameras: Camera[];
  loading: boolean;
  error: string | null;
  lastFetched: number;
  setCameras: (cameras: Camera[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: [],
  loading: false,
  error: null,
  lastFetched: 0,
  setCameras: (cameras) => set({ cameras, lastFetched: Date.now() }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
