"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export interface ContextNavigationConfig {
  title: string;
  backHref: string;
  backLabel: string;
  content: ReactNode;
}

interface ContextNavigationValue {
  navigation: ContextNavigationConfig | null;
  setNavigation: (navigation: ContextNavigationConfig | null) => void;
}

const ContextNavigationContext = createContext<ContextNavigationValue | null>(null);

export function ContextNavigationProvider({ children }: { children: ReactNode }) {
  const [navigation, setNavigation] = useState<ContextNavigationConfig | null>(null);
  return (
    <ContextNavigationContext.Provider value={{ navigation, setNavigation }}>
      {children}
    </ContextNavigationContext.Provider>
  );
}

export function useContextNavigation() {
  const context = useContext(ContextNavigationContext);
  if (!context) throw new Error("useContextNavigation must be used inside ContextNavigationProvider");
  return context;
}
