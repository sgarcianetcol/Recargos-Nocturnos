// src/context/ParametrosGlobalesContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getParametros,
  actualizarParametros,
} from "@/services/parametros.service";
import {
  NominaConfig,
  RecargosConfig,
  JornadaRules,
} from "@/models/config.model";
import {
  DEFAULT_NOMINA,
  DEFAULT_RECARGOS,
  DEFAULT_RULES,
} from "@/models/defaults";

export type Parametros = {
  nomina: NominaConfig;
  recargos: RecargosConfig;
  rules: JornadaRules;
};

type ContextType = {
  parametros: Parametros;
  setParametros: (p: Partial<Parametros>) => void;
  guardar: () => Promise<void>;
};

const DEFAULT_PARAMETROS: Parametros = {
  nomina: DEFAULT_NOMINA,
  recargos: DEFAULT_RECARGOS,
  rules: DEFAULT_RULES,
};

const Context = createContext<ContextType>({
  parametros: DEFAULT_PARAMETROS,
  setParametros: () => {},
  guardar: async () => {},
});

export const ParametrosProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [parametros, setParametrosState] =
    useState<Parametros>(DEFAULT_PARAMETROS);

  useEffect(() => {
    (async () => {
      const data = await getParametros();
      if (data) {
        setParametrosState({
          ...DEFAULT_PARAMETROS,
          ...data,
          nomina: { ...DEFAULT_PARAMETROS.nomina, ...data.nomina },
          recargos: { ...DEFAULT_PARAMETROS.recargos, ...data.recargos },
          rules: { ...DEFAULT_PARAMETROS.rules, ...data.rules },
        });
      }
    })();
  }, []);

  const setParametros = (partial: Partial<Parametros>) => {
    setParametrosState((p) => ({ ...p, ...partial }));
  };

  const guardar = async () => {
    await actualizarParametros(parametros);
  };

  return (
    <Context.Provider value={{ parametros, setParametros, guardar }}>
      {children}
    </Context.Provider>
  );
};

export const useParametrosGlobales = () => useContext(Context);
