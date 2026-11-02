import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  ouverte: boolean;
  titre: string;
  onFermer: () => void;
  children: ReactNode;
  pied?: ReactNode;
  large?: boolean;
}

/**
 * Feuille modale : glisse du bas sur iPhone, dialogue centré sur Mac.
 * Basée sur <dialog> pour le focus et la touche Échap.
 */
export function Feuille({ ouverte, titre, onFermer, children, pied, large }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouverte && !d.open) d.showModal();
    if (!ouverte && d.open) d.close();
  }, [ouverte]);

  return (
    <dialog
      ref={ref}
      className={"feuille" + (large ? " feuille--large" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => {
        // clic sur le voile (hors du contenu)
        if (e.target === ref.current) onFermer();
      }}
      aria-labelledby="feuille-titre"
    >
      {ouverte && (
        <div className="feuille__corps">
          <header className="feuille__tete">
            <h2 id="feuille-titre">{titre}</h2>
            <button className="bouton-icone" onClick={onFermer} aria-label="Fermer">
              <X size={20} />
            </button>
          </header>
          <div className="feuille__contenu">{children}</div>
          {pied && <footer className="feuille__pied">{pied}</footer>}
        </div>
      )}
    </dialog>
  );
}
