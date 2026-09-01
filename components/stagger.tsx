"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

// Split & Stagger Enter (nach Jakub Krehel): Page-Sections kommen beim Mount
// gestaffelt mit blur + opacity + translateY rein -- nicht der ganze Container
// auf einmal, sondern jede Section einzeln mit ~70ms Versatz.
// Reduced-Motion: zusaetzlich zum globalen <MotionConfig reducedMotion="user">
// (das nur transform/layout kappt) gaten wir hier explizit -- sonst liefen
// opacity + filter:blur weiter. useReducedMotion() -> Endzustand sofort.

// Atlas-Signaturkurve (= --ease-atlas), als Array fuer Framer.
const EASE = [0.22, 1, 0.36, 1] as const;

// Polish: bei Seiten mit mehreren Sections (Settings: 6 StaggerItems) kam die
// letzte Section erst nach ~0.8s an -- fuehlt sich wie Warten statt Kaskade an.
// Engere Schritte + kuerzere Item-Dauer halten die Kaskade unter ~0.6s.
const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10, filter: "blur(3px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.32, ease: EASE },
  },
};

export function Stagger({ children, ...props }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? "visible" : "hidden"} animate="visible" variants={container} {...props}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={item} {...(reduce ? { initial: false } : {})} {...props}>
      {children}
    </motion.div>
  );
}

// Split-Text: zerlegt eine Ueberschrift in ihre Wortteile (Buchstaben) und laesst
// sie gestaffelt mit blur + opacity + translateY rein. Orchestriert sich selbst
// (eigenes initial/animate), laeuft also unabhaengig beim Mount. a11y: das Wort
// steht als aria-label am Container, die Buchstaben sind aria-hidden.
// Polish: dieselbe Straffung wie beim Container -- ein 13-Buchstaben-Wort
// ("Einstellungen") brauchte vorher bis zu ~0.8s, bis der letzte Buchstabe stand.
const splitContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.02, delayChildren: 0.06 } },
};

const splitChar = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.35, ease: EASE },
  },
};

export function SplitText({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  // Reduced-Motion: Wort statisch ausgeben, kein Per-Buchstabe-Blur/Stagger.
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <motion.span
      aria-label={text}
      initial="hidden"
      animate="visible"
      variants={splitContainer}
      className={className}
      style={{ display: "inline-block" }}
    >
      {Array.from(text).map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          variants={splitChar}
          style={{ display: "inline-block", whiteSpace: "pre" }}
        >
          {c}
        </motion.span>
      ))}
    </motion.span>
  );
}
