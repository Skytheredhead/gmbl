"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function Loading() {
  const [fromHome, setFromHome] = useState(false);

  useEffect(() => {
    try {
      const ref = document.referrer;
      if (ref) {
        const url = new URL(ref);
        if (url.origin === window.location.origin && (url.pathname === "/" || url.pathname === "")) {
          setFromHome(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  if (fromHome) {
    return (
      <motion.div
        className="fixed inset-0 gmbl-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
    );
  }

  return (
    <div className="fixed inset-0 gmbl-bg flex items-center justify-center">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-white border-t-transparent" />
    </div>
  );
}
