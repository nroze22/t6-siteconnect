import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-8 px-4" : "py-16 px-6"}`}
    >
      {/* Animated icon container */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", damping: 15, stiffness: 200 }}
        className="relative mb-5"
      >
        <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/10 ring-1 ring-indigo-500/20">
          <span className="text-indigo-400">{icon}</span>
        </div>
      </motion.div>

      <h3 className="text-[14px] font-semibold text-slate-200">{title}</h3>
      <p className="mt-1.5 max-w-[280px] text-[11px] leading-relaxed text-slate-500">
        {description}
      </p>

      {action && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          onClick={action.onClick}
          className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.97]"
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  );
}
