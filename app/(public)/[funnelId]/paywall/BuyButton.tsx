'use client';

import { useState } from 'react';

import { recordBuyEvent } from '@/app/actions/tracking';

interface BuyButtonProps {
  funnelId: string;
  className?: string;
  children: React.ReactNode;
}

export default function BuyButton({ funnelId, className, children }: BuyButtonProps) {
  const [showToast, setShowToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await recordBuyEvent(funnelId);
    setIsSubmitting(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className={className}
      >
        {children}
      </button>
      {showToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-2xl border border-emerald-400/40"
        >
          Success buy
        </div>
      )}
    </>
  );
}
