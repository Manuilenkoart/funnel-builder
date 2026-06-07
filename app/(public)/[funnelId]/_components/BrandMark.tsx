export default function BrandMark() {
  return (
    <div
      className="flex items-center gap-[9px] text-base font-semibold text-white"
      style={{
        letterSpacing: -0.3,
        textShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }}
    >
      <span
        className="relative inline-block size-[22px] rounded-md"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.15))",
          border: "0.5px solid rgba(255,255,255,0.45)",
          boxShadow:
            "inset 0 0.5px 0 rgba(255,255,255,0.7), inset 0 -0.5px 0 rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.18)",
        }}
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 2l1.4 3.6L12 7l-3.6 1.4L7 12l-1.4-3.6L2 7l3.6-1.4z"
              fill="#fff"
            />
          </svg>
        </span>
      </span>
      funnel builder
    </div>
  );
}
