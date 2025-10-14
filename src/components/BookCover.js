export default function BookCover({ title }) {
  const colors = [
    "from-amber-900/90 to-amber-800/90",
    "from-emerald-900/90 to-emerald-800/90",
    "from-blue-900/90 to-blue-800/90",
    "from-purple-900/90 to-purple-800/90",
    "from-rose-900/90 to-rose-800/90",
    "from-slate-800/90 to-slate-700/90",
  ];

  const hashStringToInt = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  };

  const colorIndex =
    hashStringToInt(
      String(title || "")
        .toLowerCase()
        .trim()
    ) % colors.length;
  const gradientClass = colors[colorIndex];

  const length = String(title || "").length;
  const fontSize =
    length > 40
      ? "text-[10px]"
      : length > 25
      ? "text-xs"
      : length > 15
      ? "text-sm"
      : "text-base";

  return (
    <div
      className={`w-full h-full relative overflow-hidden rounded-sm bg-gradient-to-br ${gradientClass} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_-24px_48px_rgba(0,0,0,0.25)]`}
    >
      {/* spine */}
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/45 via-black/20 to-transparent" />

      {/* vignette/highlight */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.12),transparent_60%)]" />

      {/* subtle paper texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.06) 2px, rgba(255,255,255,0.06) 3px)",
        }}
      />

      <div className="relative z-10 flex h-full items-center justify-center px-2">
        <h3
          className={`text-white font-serif ${fontSize} leading-tight text-center tracking-wide line-clamp-6`}
        >
          {title}
        </h3>
      </div>
    </div>
  );
}
