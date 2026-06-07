export default function Motif() {
  return (
    <div
      className="flex size-16 items-center justify-center"
      style={{
        borderRadius: 18,
        background: "rgba(255,255,255,0.20)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "0.5px solid rgba(255,255,255,0.42)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.15), 0 6px 18px rgba(0,0,0,0.16)",
      }}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="M14 4l2.2 7.8L24 14l-7.8 2.2L14 24l-2.2-7.8L4 14l7.8-2.2z"
          fill="#fff"
          opacity="0.92"
        />
      </svg>
    </div>
  );
}
