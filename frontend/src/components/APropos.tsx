import { useEffect, useRef } from "react";
import { Shirt, X } from "lucide-react";

/**
 * Fenêtre « À propos » de la marque commune (atelier-brand.css, docs/SUITE.md §1.6) :
 * grande icône de l'app, nom « Atelier Dressing », une phrase. Suit le thème de l'app.
 */
export function APropos({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
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
      className="atelier-about"
      aria-labelledby="a-propos-nom"
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onFermer();
      }}
    >
      <div className="atelier-about__panel">
        <button type="button" className="atelier-about__close" aria-label="Fermer" onClick={onFermer}>
          <X size={16} aria-hidden />
        </button>
        <span className="atelier-about__icon atelier-brand__tile" aria-hidden="true">
          <Shirt />
        </span>
        <h2 id="a-propos-nom" className="atelier-about__name">
          <span className="atelier-brand__prefix">Atelier </span>Dressing
        </h2>
        <p className="atelier-about__tagline">Ton dressing en photos, ton mannequin et tes tenues.</p>
        <p className="atelier-about__suite">Suite Atelier</p>
      </div>
    </dialog>
  );
}
