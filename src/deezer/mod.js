import { getBlowfishKey, encryptDownloadUrl } from "./crypto.js";

// Dependencia necesaria para manejo de cookies con fetch en Node.js
// Instalar: npm install tough-cookie
import { CookieJar, Cookie } from "tough-cookie";

const API_URL = "https://www.deezer.com/ajax/gw-light.php";
const LEGACY_API_URL = "https://api.deezer.com";

export class DeezerClient {
  #http;
  #jar;

  constructor({
    http,
    jar,
    arl,
    token = "",
    licenseToken = null,
    user = null,
  }) {
    this.#http = http;
    this.#jar = jar;
    this.arl = arl;
    this.token = token;
    this.licenseToken = licenseToken;
    this.user = user;
  }

  static async create(arl) {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "*/*",
      "Cache-Control": "max-age=0",
      Connection: "keep-alive",
    };

    const jar = new CookieJar();
    const cookie = Cookie.parse(
      `arl=${arl}; Domain=.deezer.com; Path=/; Secure; HttpOnly`,
    );
    await jar.setCookie(cookie, "https://www.deezer.com");

    const http = createHttpClient({ headers, jar });

    const client = new DeezerClient({
      http,
      jar,
      arl,
      token: "",
      licenseToken: null,
      user: null,
    });

    await client.login();
    return client;
  }

  async login() {
    // Request inicial para establecer sesión y obtener cookie SID
    await this.#http.get(API_URL);

    const data = await this.apiCall("deezer.getUserData", null);
    const results = data.results;

    this.token = results.checkForm;
    if (!this.token) {
      throw new Error("Failed to get auth token from Deezer");
    }

    this.licenseToken = results.USER?.OPTIONS?.license_token || null;

    const userId = results.USER?.USER_ID;
    const userNum = typeof userId === "string" ? parseInt(userId, 10) : userId;

    if (!userNum || userNum === 0) {
      throw new Error("Invalid ARL token");
    }

    const name = results.USER?.BLOG_NAME || "Unknown";
    const picture = results.USER?.USER_PICTURE || "";

    const image =
      !picture || picture.split("").every((c) => c === "0")
        ? null
        : `https://e-cdns-images.dzcdn.net/images/user/${picture}/250x250-000000-80-0-0.jpg`;

    const offerName = (
      results.OFFER_NAME ||
      results.USER?.OFFER_NAME ||
      results.USER?.OPTIONS?.offer_name ||
      ""
    ).toLowerCase();
    const hasAds =
      results.USER?.OPTIONS?.ads_audio ||
      results.USER?.OPTIONS?.ads_display ||
      false;
    const isFreeAccount =
      offerName.includes("free") ||
      offerName.includes("gratuit") ||
      offerName.includes("kostenlos") ||
      (!offerName && hasAds);

    this.user = {
      id: userNum,
      name,
      image,
      isFreeAccount,
    };
  }

  async searchTracks(query, limit) {
    const url = `${LEGACY_API_URL}/search/track`;

    const res = await this.#http.get(url, {
      params: { q: query, limit: limit.toString(), index: "0" },
    });

    const data = await res.json();

    if (data.error && Object.keys(data.error).length > 0) {
      const msg = Object.values(data.error)[0] || "Unknown error";
      throw new Error(`API error: ${msg}`);
    }

    const tracks = (data.data || [])
      .map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist?.name || "",
        artistId: t.artist?.id || 0,
        album: t.album?.title || "Unknown",
        duration: t.duration || 0,
        coverSmall: t.album?.cover_small || "",
        coverMedium: t.album?.cover_medium || "",
        preview: t.preview || null,
      }))
      .filter((t) => t.id);

    return tracks;
  }

  async searchAlbums(query, limit) {
    const url = `${LEGACY_API_URL}/search/album`;

    const res = await this.#http.get(url, {
      params: { q: query, limit: limit.toString(), index: "0" },
    });

    const data = await res.json();

    if (data.error && Object.keys(data.error).length > 0) {
      const msg = Object.values(data.error)[0] || "Unknown error";
      throw new Error(`API error: ${msg}`);
    }

    const albums = (data.data || [])
      .map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist?.name || "",
        artistId: a.artist?.id || 0,
        coverSmall: a.cover_small || "",
        coverMedium: a.cover_medium || "",
        nbTracks: a.nb_tracks || 0,
      }))
      .filter((a) => a.id);

    return albums;
  }

  async getAlbumTracks(albumId) {
    const tracksUrl = `${LEGACY_API_URL}/album/${albumId}/tracks`;

    // Fetch concurrente de tracks y metadatos del álbum
    const [tracksRes, albumData] = await Promise.all([
      this.#http
        .get(tracksUrl, { params: { limit: "500" } })
        .then((r) => r.json()),
      this.getAlbum(albumId),
    ]);

    const data = tracksRes;
    const albumTitle = albumData.title || "Unknown";
    const coverSmall = albumData.cover_small || "";
    const coverMedium = albumData.cover_medium || "";

    const tracks = (data.data || [])
      .map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist?.name || "",
        artistId: t.artist?.id || 0,
        album: albumTitle,
        duration: t.duration || 0,
        coverSmall: t.album?.cover_small || coverSmall,
        coverMedium: t.album?.cover_medium || coverMedium,
        preview: t.preview || null,
      }))
      .filter((t) => t.id);

    return tracks;
  }

  async searchArtists(query, limit) {
    const url = `${LEGACY_API_URL}/search/artist`;

    const res = await this.#http.get(url, {
      params: { q: query, limit: limit.toString(), index: "0" },
    });

    const data = await res.json();

    if (data.error && Object.keys(data.error).length > 0) {
      const msg = Object.values(data.error)[0] || "Unknown error";
      throw new Error(`API error: ${msg}`);
    }

    const artists = (data.data || [])
      .map((a) => ({
        id: a.id,
        name: a.name,
        pictureSmall: a.picture_small || "",
        pictureMedium: a.picture_medium || "",
        nbAlbum: a.nb_album || 0,
        nbFan: a.nb_fan || 0,
      }))
      .filter((a) => a.id);

    return artists;
  }

  async getArtistAlbums(artistId) {
    const url = `${LEGACY_API_URL}/artist/${artistId}/albums`;

    const res = await this.#http.get(url, { params: { limit: "100" } });
    const data = await res.json();

    const albums = (data.data || [])
      .map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist?.name || "",
        artistId: a.artist?.id || 0,
        coverSmall: a.cover_small || "",
        coverMedium: a.cover_medium || "",
        nbTracks: a.nb_tracks || 0,
      }))
      .filter((a) => a.id);

    return albums;
  }

  async searchPlaylists(query, limit) {
    const url = `${LEGACY_API_URL}/search/playlist`;

    const res = await this.#http.get(url, {
      params: { q: query, limit: limit.toString(), index: "0" },
    });

    const data = await res.json();

    if (data.error && Object.keys(data.error).length > 0) {
      const msg = Object.values(data.error)[0] || "Unknown error";
      throw new Error(`API error: ${msg}`);
    }

    const playlists = (data.data || [])
      .map((p) => ({
        id: p.id,
        title: p.title,
        creator: p.user?.name || "",
        coverSmall: p.picture_small || "",
        coverMedium: p.picture_medium || "",
        nbTracks: p.nb_tracks || 0,
      }))
      .filter((p) => p.id);

    return playlists;
  }

  async getPlaylistTracks(playlistId) {
    const url = `${LEGACY_API_URL}/playlist/${playlistId}`;

    const res = await this.#http.get(url);
    const data = await res.json();

    const coverSmall = data.picture_small || "";
    const coverMedium = data.picture_medium || "";

    const tracks = (data.tracks?.data || [])
      .map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist?.name || "",
        artistId: t.artist?.id || 0,
        album: t.album?.title || "Unknown",
        duration: t.duration || 0,
        coverSmall: t.album?.cover_small || coverSmall,
        coverMedium: t.album?.cover_medium || coverMedium,
        preview: t.preview || null,
      }))
      .filter((t) => t.id);

    return tracks;
  }

  async getTrackById(trackId) {
    const url = `${LEGACY_API_URL}/track/${trackId}`;

    const res = await this.#http.get(url);
    const data = await res.json();

    if (data.error?.message) {
      throw new Error(`API error: ${data.error.message}`);
    }

    const id = data.id || parseInt(trackId, 10);
    const title = data.title || "";

    if (!title) {
      throw new Error("Track not found");
    }

    return {
      id,
      title,
      artist: data.artist?.name || "Unknown",
      artistId: data.artist?.id || 0,
      album: data.album?.title || "Unknown",
      duration: data.duration || 0,
      coverSmall: data.album?.cover_small || "",
      coverMedium: data.album?.cover_medium || "",
      preview: data.preview || null,
    };
  }

  async getTrack(trackId) {
    const params = { SNG_ID: trackId };
    const data = await this.apiCall("song.getData", params);
    return data.results;
  }

  async getTrackDownloadUrl(track, quality, fallback = true) {
    const trackData = track.DATA || track;

    if (trackData.TRACK_TOKEN && this.licenseToken) {
      const trackToken = trackData.TRACK_TOKEN;
      const licenseToken = this.licenseToken;

      // Intentar calidad solicitada primero
      const result = await this.#getMediaUrl(
        trackToken,
        licenseToken,
        quality,
        false,
      );
      if (result) {
        return result;
      }

      if (fallback) {
        for (const fallbackQuality of getFallbackQualities(quality)) {
          const result = await this.#getMediaUrl(
            trackToken,
            licenseToken,
            fallbackQuality,
            false,
          );
          if (result) {
            return result;
          }
        }
      }
    }

    const md5Origin = trackData.MD5_ORIGIN;
    if (!md5Origin) {
      throw new Error("Track unavailable (no MD5_ORIGIN)");
    }

    const sngId = extractStringOrU64(trackData.SNG_ID);
    if (!sngId) {
      throw new Error("Track unavailable (no SNG_ID)");
    }

    const mediaVersion = trackData.MEDIA_VERSION;
    if (!mediaVersion) {
      throw new Error("Track unavailable (no MEDIA_VERSION)");
    }

    const qualityCode = getQualityCode(quality);
    const url = encryptDownloadUrl(md5Origin, qualityCode, sngId, mediaVersion);

    const res = await this.#http.get(url);

    if (res.ok) {
      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 0) {
        return [url, quality];
      }
    }

    if (!fallback) {
      throw new Error("Track not available in requested quality");
    }

    for (const q of getFallbackQualities(quality)) {
      const qc = getQualityCode(q);
      const fallbackUrl = encryptDownloadUrl(
        md5Origin,
        qc,
        sngId,
        mediaVersion,
      );
      const fallbackRes = await this.#http.get(fallbackUrl);

      if (fallbackRes.ok) {
        const contentLength = fallbackRes.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > 0) {
          return [fallbackUrl, q];
        }
      }
    }

    throw new Error("No working download URL found");
  }

  async getAlbum(albumId) {
    const url = `${LEGACY_API_URL}/album/${albumId}`;
    const res = await this.#http.get(url);
    return res.json();
  }

  async getAlbumCover(coverId, size) {
    const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10 MiB

    const url = `https://e-cdns-images.dzcdn.net/images/cover/${coverId}/${size}x${size}.jpg`;
    const res = await this.#http.get(url);

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_COVER_BYTES) {
      throw new Error(`Cover image too large: ${contentLength} bytes`);
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_COVER_BYTES) {
      throw new Error(`Cover image too large: ${bytes.byteLength} bytes`);
    }

    return Buffer.from(bytes);
  }

  async #getMediaUrl(trackToken, licenseToken, quality, fallback = false) {
    let formats = [
      {
        cipher: "BF_CBC_STRIPE",
        format: quality,
      },
    ];

    if (fallback) {
      for (const q of ["MP3_320", "MP3_128", "FLAC"]) {
        if (q !== quality) {
          formats.push({
            cipher: "BF_CBC_STRIPE",
            format: q,
          });
        }
      }
    }

    const body = {
      license_token: licenseToken,
      media: [{ type: "FULL", formats }],
      track_tokens: [trackToken],
    };

    try {
      const res = await this.#http.post("https://media.deezer.com/v1/get_url", {
        json: body,
      });

      const result = await res.json();
      const data = result.data;

      if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
      }

      const media = data[0].media;
      if (!media || !Array.isArray(media) || media.length === 0) {
        return null;
      }

      const sources = media[0].sources;
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return null;
      }

      const url = sources[0].url;
      const fmt = media[0].format || quality;

      if (url) {
        return [url, fmt];
      }
    } catch {
      return null;
    }

    return null;
  }

  async apiCall(method, params = null) {
    const token = method === "deezer.getUserData" ? "null" : this.token;
    const body = params || {};

    const res = await this.#http.post(API_URL, {
      params: {
        api_version: "1.0",
        api_token: token,
        input: "3",
        method,
      },
      json: body,
    });

    const data = await res.json();

    if (data.error && Object.keys(data.error).length > 0) {
      const msg = Object.values(data.error)[0] || "Unknown error";
      throw new Error(`Deezer error: ${msg}`);
    }

    return data;
  }
}

function getQualityCode(quality) {
  const map = {
    FLAC: 9,
    MP3_128: 1,
    MP3_256: 5,
    MP3_320: 3,
    MP4_RA1: 13,
    MP4_RA2: 14,
    MP4_RA3: 15,
  };
  return map[quality] || 3;
}

function getFallbackQualities(quality) {
  const map = {
    FLAC: ["MP3_320", "MP3_128"],
    MP3_320: ["MP3_128"],
  };
  return map[quality] || [];
}

export function getQualityExt(quality) {
  const map = {
    FLAC: ".flac",
    MP3_128: ".mp3",
    MP3_256: ".mp3",
    MP3_320: ".mp3",
    MP4_RA1: ".mp4",
    MP4_RA2: ".mp4",
    MP4_RA3: ".mp4",
  };
  return map[quality] || ".mp3";
}

function extractStringOrU64(val) {
  if (typeof val === "string") return val;
  if (typeof val === "number") return val.toString();
  return null;
}

// Wrapper HTTP con soporte para cookie jar
function createHttpClient({ headers, jar }) {
  return {
    async get(url, { params = {}, headers: extraHeaders = {} } = {}) {
      const queryString = new URLSearchParams(params).toString();
      const fullUrl = queryString ? `${url}?${queryString}` : url;

      const cookieHeader = await jar.getCookieString(url);

      const res = await fetch(fullUrl, {
        headers: {
          ...headers,
          ...extraHeaders,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      });

      // Almacenar cookies de la respuesta
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        const cookies = setCookie.split(",");
        for (const cookie of cookies) {
          await jar.setCookie(cookie.trim(), url);
        }
      }

      return res;
    },

    async post(
      url,
      { params = {}, json = null, headers: extraHeaders = {} } = {},
    ) {
      const queryString = new URLSearchParams(params).toString();
      const fullUrl = queryString ? `${url}?${queryString}` : url;

      const cookieHeader = await jar.getCookieString(url);

      const body = json ? JSON.stringify(json) : null;

      const res = await fetch(fullUrl, {
        method: "POST",
        headers: {
          ...headers,
          ...extraHeaders,
          "Content-Type": "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body,
      });

      // Almacenar cookies de la respuesta
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        const cookies = setCookie.split(",");
        for (const cookie of cookies) {
          await jar.setCookie(cookie.trim(), url);
        }
      }

      return res;
    },
  };
}
