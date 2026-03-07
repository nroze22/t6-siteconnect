import { motion, AnimatePresence } from "framer-motion";
import { useRef } from "react";

interface PageTransitionProps {
  pageKey: string;
  children: React.ReactNode;
}

export function PageTransition({ pageKey, children }: PageTransitionProps) {
  const direction = useRef(0);
  const prevKey = useRef(pageKey);

  if (prevKey.current !== pageKey) {
    direction.current = 1;
    prevKey.current = pageKey;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
