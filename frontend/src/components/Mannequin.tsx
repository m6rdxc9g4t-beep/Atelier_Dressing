import { useId, useMemo, useRef, type PointerEvent as PE } from "react";
import { PLAN } from "../lib/categories";
import { useImage, useMesure } from "../lib/donnees";
import { HAUTEUR, LARGEUR, rectPiece, tracer, zone } from "../lib/mannequin";
import type { Avatar, Calage, Vetement } from "../lib/types";

interface Props {
  avatar: Avatar;
  pieces: Vetement[];
  /** Pièce en cours d'ajustement (glisser pour déplacer, molette pour agrandir). */
  selection?: string | null;
  onSelection?: (id: string | null) => void;
  onCalage?: (id: string, calage: Calage) => void;
  petit?: boolean;
  /** Étiquette lue par les lecteurs d'écran. */
  libelle?: string;
  /** Photos pas encore enregistrées (aperçu du scanner) : id de la pièce → adresse. */
  apercus?: Record<string, string>;
}

/**
 * Le mannequin qui te ressemble, habillé des photos détourées de tes pièces.
 * SVG pur : se redimensionne sans perte, du petit aperçu de tenue à la cabine.
 */
export function Mannequin({ avatar, pieces, selection, onSelection, onCalage, petit, libelle, apercus }: Props) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const trace = useMemo(() => tracer(avatar), [avatar]);
  const visage = useImage(avatar.visage);
  const triees = useMemo(
    () => [...pieces].filter((p) => p.categorie !== "autre").sort((a, b) => PLAN[a.categorie] - PLAN[b.categorie]),
    [pieces],
  );
  const t = trace.tete;
  const ajustable = !!onCalage;

  return (
    <svg
      ref={svg}
      className={"mannequin" + (petit ? " mannequin--petit" : "") + (ajustable && selection ? " mannequin--ajustement" : "")}
      viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
      role="img"
      aria-label={libelle ?? "Ton mannequin"}
      onPointerDown={(e) => {
        if (ajustable && e.target === svg.current) onSelection?.(null);
      }}
      onWheel={(e) => {
        if (!ajustable || !selection) return;
        const p = pieces.find((x) => x.id === selection);
        if (!p) return;
        const echelle = Math.min(3, Math.max(0.3, p.calage.echelle * Math.exp(-e.deltaY * 0.0015)));
        onCalage?.(p.id, { ...p.calage, echelle: Math.round(echelle * 100) / 100 });
      }}
    >
      <defs>
        <linearGradient id={`peau-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={avatar.carnation} />
          <stop offset="0.62" stopColor={avatar.carnation} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${avatar.carnation} 82%, #000)`} />
        </linearGradient>
        <radialGradient id={`tete-${id}`} cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor={avatar.carnation} />
          <stop offset="0.75" stopColor={avatar.carnation} />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </radialGradient>
        <radialGradient id={`sol-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--ombre-sol)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--ombre-sol)" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`visage-${id}`}>
          <ellipse cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} />
        </clipPath>
      </defs>

      {/* Ombre au sol */}
      <ellipse cx={LARGEUR / 2} cy={962} rx={150} ry={22} fill={`url(#sol-${id})`} />

      {/* Corps : cheveux de dos, bras, silhouette, tête */}
      <g className="mannequin__corps">
        {trace.cheveuxArriere && <path d={trace.cheveuxArriere} fill={avatar.cheveux_couleur} />}
        <path d={trace.brasGauche} fill={`url(#peau-${id})`} />
        <path d={trace.brasDroit} fill={`url(#peau-${id})`} />
        <path d={trace.corps} fill={`url(#peau-${id})`} />
        <ellipse cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} fill={`url(#tete-${id})`} />
        {visage ? (
          <image
            href={visage}
            x={t.cx - t.rx}
            y={t.cy - t.ry}
            width={t.rx * 2}
            height={t.ry * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#visage-${id})`}
          />
        ) : (
          <path d={trace.cheveuxAvant} fill={avatar.cheveux_couleur} />
        )}
      </g>
      {/* Contour fin du mannequin */}
      <g className="mannequin__contour">
        <path d={trace.brasGauche} />
        <path d={trace.brasDroit} />
        <path d={trace.corps} />
        <ellipse cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} />
      </g>

      {/* Les pièces, de la plus basse (chaussures) à la plus haute (chapeau) */}
      {triees.map((p) => (
        <Piece
          key={p.id}
          piece={p}
          avatar={avatar}
          svg={svg}
          choisie={selection === p.id}
          ajustable={ajustable}
          onSelection={onSelection}
          onCalage={onCalage}
          urlForcee={apercus?.[p.id]}
        />
      ))}
    </svg>
  );
}

function Piece({
  piece,
  avatar,
  svg,
  choisie,
  ajustable,
  onSelection,
  onCalage,
  urlForcee,
}: {
  urlForcee?: string;
  piece: Vetement;
  avatar: Avatar;
  svg: React.RefObject<SVGSVGElement | null>;
  choisie: boolean;
  ajustable: boolean;
  onSelection?: (id: string | null) => void;
  onCalage?: (id: string, calage: Calage) => void;
}) {
  const stockee = useImage(urlForcee ? null : piece.image);
  const url = urlForcee ?? stockee;
  const mesure = useMesure(url);
  const glisse = useRef<{ x: number; y: number; calage: Calage } | null>(null);
  if (!url || !mesure) return null;
  const r = rectPiece(avatar, piece, mesure.ratio, mesure.reperes);
  const z = zone(avatar, piece.categorie, piece.longueur, piece.sous_type);

  const versSvg = (e: PE) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return { x: e.clientX / m.a, y: e.clientY / m.d };
  };

  return (
    <g
      className={"piece" + (choisie ? " piece--choisie" : "") + (ajustable ? " piece--ajustable" : "")}
      onPointerDown={(e) => {
        if (!ajustable) return;
        e.stopPropagation();
        onSelection?.(piece.id);
        const p = versSvg(e);
        glisse.current = { ...p, calage: piece.calage };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const g = glisse.current;
        if (!g || !onCalage) return;
        const p = versSvg(e);
        const dx = Math.max(-0.6, Math.min(0.6, g.calage.dx + (p.x - g.x) / z.w));
        const dy = Math.max(-0.6, Math.min(0.6, g.calage.dy + (p.y - g.y) / z.h));
        onCalage(piece.id, { ...g.calage, dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 });
      }}
      onPointerUp={() => (glisse.current = null)}
      onPointerCancel={() => (glisse.current = null)}
    >
      <image href={url} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
      {choisie && <rect className="piece__cadre" x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} rx={10} />}
    </g>
  );
}
