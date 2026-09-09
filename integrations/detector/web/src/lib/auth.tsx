import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from "react";
import { getToken, clearToken } from "./api";

interface AuthCtx {
  authenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  authenticated: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(() => !!getToken());

  const login = useCallback(() => {
    setAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuthenticated(false);
  }, []);

  useEffect(() => {
    const handler = () => setAuthenticated(false);
    window.addEventListener("rtk:token-invalid", handler);
    return () => window.removeEventListener("rtk:token-invalid", handler);
  }, []);

  const contextValue = useMemo(
    () => ({ authenticated, login, logout }),
    [authenticated, login, logout]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
