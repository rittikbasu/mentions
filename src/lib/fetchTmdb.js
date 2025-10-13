export async function fetchTmdbMetadata(title, type) {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return null;

    const isTvShow = type === "tv_show";
    const endpoint = isTvShow ? "tv" : "movie";
    const query = encodeURIComponent(title);

    const response = await fetch(
      `https://api.themoviedb.org/3/search/${endpoint}?api_key=${apiKey}&query=${query}&language=en-US&include_adult=false`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) return null;

    const normalize = (s) =>
      String(s || "")
        .trim()
        .toLowerCase();
    const normInput = normalize(title);

    let chosen = results.find(
      (r) => normalize(isTvShow ? r.name : r.title) === normInput
    );
    if (!chosen) {
      chosen = results.reduce((best, r) => {
        if (!best) return r;
        return (Number(r.popularity) || 0) > (Number(best.popularity) || 0)
          ? r
          : best;
      }, null);
    }
    if (!chosen) return null;

    const img = chosen.poster_path || chosen.backdrop_path || null;
    return {
      title: isTvShow ? chosen.name || title : chosen.title || title,
      image_url: img ? `https://image.tmdb.org/t/p/w185${img}` : null,
    };
  } catch (_) {
    return null;
  }
}
