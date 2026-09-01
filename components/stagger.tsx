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

// Animations-Audit: filter:blur entfernt -- Skill-Prinzip 1 (nur transform/
// opacity animieren). Blur ist teuer (Safari besonders) und traegt hier keine
// zusaetzliche Information gegenueber opacity+y.
const item = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
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
