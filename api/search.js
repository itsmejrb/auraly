const crypto = require("node-forge");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36";
const IMG_SIZES = ["50x50", "150x150", "500x500"];
const QUALITIES = [
  { id: "_12", bitrate: "12kbps" },
  { id: "_48", bitrate: "48kbps" },
  { id: "_96", bitrate: "96kbps" },
  { id: "_160", bitrate: "160kbps" },
  { id: "_320", bitrate: "320kbps" },
];

function decryptUrl(enc) {
  if (!enc) return [];
  const key = crypto.util.createBuffer("38346591");
  const decipher = crypto.cipher.createDecipher("DES-ECB", key);
  decipher.start({ iv: crypto.util.createBuffer("00000000") });
  decipher.update(crypto.util.createBuffer(crypto.util.decode64(enc)));
  decipher.finish();
  const base = decipher.output.getBytes();
  return QUALITIES.map((q) => ({ quality: q.bitrate, url: base.replace("_96", q.id) }));
}

function getImages(link) {
  if (!link) return [];
  return IMG_SIZES.map((size) => ({
    quality: size,
    url: link.replace(/150x150|50x50/, size).replace(/^http:\/\//, "https://"),
  }));
}

function mapArtist(a) {
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    image: getImages(a.image),
    type: a.type,
    url: a.perma_url,
  };
}

function toSong(s) {
  const m = s.more_info || {};
  return {
    id: s.id,
    name: s.title,
    type: s.type,
    year: s.year || null,
    releaseDate: m.release_date || null,
    duration: m.duration ? Number(m.duration) : null,
    label: m.label || null,
    explicitContent: s.explicit_content === "1",
    playCount: s.play_count ? Number(s.play_count) : null,
    language: s.language,
    hasLyrics: m.has_lyrics === "true",
    lyricsId: m.lyrics_id || null,
    url: s.perma_url,
    copyright: m.copyright_text || null,
    album: {
      id: m.album_id || null,
      name: m.album || null,
      url: m.album_url || null,
    },
    artists: {
      primary: (m.artistMap?.primary_artists || []).map(mapArtist),
      featured: (m.artistMap?.featured_artists || []).map(mapArtist),
      all: (m.artistMap?.artists || []).map(mapArtist),
    },
    image: getImages(s.image),
    downloadUrl: decryptUrl(m.encrypted_media_url),
  };
}

async function jioFetch(endpoint, params) {
  const url = new URL("https://www.jiosaavn.com/api.php");
  url.searchParams.append("__call", endpoint);
  url.searchParams.append("_format", "json");
  url.searchParams.append("_marker", "0");
  url.searchParams.append("api_version", "4");
  url.searchParams.append("ctx", "web6dot0");
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { q, page, limit } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: "Missing required param: q" });
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 10, 50);

  try {
    const data = await jioFetch("search.getResults", { q, p: pageNum, n: limitNum });
    const results = (data.results || []).map(toSong).slice(0, limitNum);
    res.status(200).json({ total: data.total, start: data.start, results });
  } catch (err) {
    console.error("[jiosaavn-api]", err.message);
    res.status(500).json({ error: "Failed to fetch results" });
  }
};
