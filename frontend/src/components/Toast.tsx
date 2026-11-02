import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  texte: string;
  action?: { label: string; faire: () => void };
  erreur?: boolean;
}

type Afficher = (texte: string, options?: { action?: Toast["action"]; erreur?: boolean }) => void;

const Ctx = createContext<Afficher>(() => {});

export function FournisseurToast({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const compteur = useRef(0);

  const afficher = useCallback<Afficher>((texte, options) => {
    window.clearTimeout(minuteur.current);
    const id = ++compteur.current;
    setToast({ id, texte, ...options });
    minuteur.current = window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      options?.action ? 6000 : 3500,
    );
  }, []);

  return (
    <Ctx.Provider value={afficher}>
      {children}
      <div className="toast-zone" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={"toast" + (toast.erreur ? " toast--erreur" : "")}>
            <span>{toast.texte}</span>
            {toast.action && (
              <button
                className="toast__action"
                onClick={() => {
                  toast.action!.faire();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
