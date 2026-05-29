/**
 * @typedef {Object} UserInfo
 * @property {number} id
 * @property {string} name
 * @property {string|null} image
 * @property {boolean} isFreeAccount
 */

/**
 * @typedef {Object} SearchResult
 * @property {number} id
 * @property {string} title
 * @property {string} artist
 * @property {number} artistId
 * @property {string} album
 * @property {number} duration
 * @property {string} coverSmall
 * @property {string} coverMedium
 * @property {string|null} preview
 */

/**
 * @typedef {Object} AlbumResult
 * @property {number} id
 * @property {string} title
 * @property {string} artist
 * @property {number} artistId
 * @property {string} coverSmall
 * @property {string} coverMedium
 * @property {number} nbTracks
 */

/**
 * @typedef {Object} ArtistResult
 * @property {number} id
 * @property {string} name
 * @property {string} pictureSmall
 * @property {string} pictureMedium
 * @property {number} nbAlbum
 * @property {number} nbFan
 */

/**
 * @typedef {Object} PlaylistResult
 * @property {number} id
 * @property {string} title
 * @property {string} creator
 * @property {string} coverSmall
 * @property {string} coverMedium
 * @property {number} nbTracks
 */

/**
 * @typedef {Object} DownloadProgress
 * @property {string} trackId
 * @property {string} title
 * @property {number} percent
 * @property {string} status
 */

/**
 * @typedef {Object} DownloadResult
 * @property {string} filePath
 * @property {string} requestedQuality
 * @property {string} actualQuality
 * @property {string} status
 */

/**
 * Tag data read from an existing MP3 or FLAC file.
 * @typedef {Object} FileTagData
 * @property {string} filePath
 * @property {string} format - "mp3" | "flac"
 * @property {string|null} title
 * @property {string|null} artist
 * @property {string|null} album
 * @property {string|null} albumArtist
 * @property {number|null} year
 * @property {number|null} track
 * @property {number|null} totalTracks
 * @property {number|null} disc
 * @property {number|null} totalDiscs
 * @property {string|null} genre
 * @property {string|null} label
 * @property {string|null} comment
 * @property {string|null} coverData - Base64-encoded cover image for UI display
 * @property {string|null} coverMime - MIME type of cover image (e.g., "image/jpeg")
 */

/**
 * Tag fields to write back to an audio file.
 * `null` means "do not change this field".
 * @typedef {Object} WriteTagData
 * @property {string|null} title
 * @property {string|null} artist
 * @property {string|null} album
 * @property {string|null} albumArtist
 * @property {number|null} year
 * @property {number|null} track
 * @property {number|null} totalTracks
 * @property {number|null} disc
 * @property {number|null} totalDiscs
 * @property {string|null} genre
 * @property {string|null} label
 * @property {string|null} comment
 * @property {string|null} newCoverPath - Path to new cover image file. `null` = keep existing
 * @property {boolean} removeCover - If true and newCoverPath is null, remove existing cover
 */

// Factory functions para crear instancias con valores por defecto (opcional)

export function createUserInfo({
  id,
  name,
  image = null,
  isFreeAccount = false,
}) {
  return { id, name, image, isFreeAccount };
}

export function createSearchResult({
  id,
  title,
  artist,
  artistId = 0,
  album = "Unknown",
  duration = 0,
  coverSmall = "",
  coverMedium = "",
  preview = null,
}) {
  return {
    id,
    title,
    artist,
    artistId,
    album,
    duration,
    coverSmall,
    coverMedium,
    preview,
  };
}

export function createAlbumResult({
  id,
  title,
  artist,
  artistId = 0,
  coverSmall = "",
  coverMedium = "",
  nbTracks = 0,
}) {
  return {
    id,
    title,
    artist,
    artistId,
    coverSmall,
    coverMedium,
    nbTracks,
  };
}

export function createArtistResult({
  id,
  name,
  pictureSmall = "",
  pictureMedium = "",
  nbAlbum = 0,
  nbFan = 0,
}) {
  return {
    id,
    name,
    pictureSmall,
    pictureMedium,
    nbAlbum,
    nbFan,
  };
}

export function createPlaylistResult({
  id,
  title,
  creator = "",
  coverSmall = "",
  coverMedium = "",
  nbTracks = 0,
}) {
  return {
    id,
    title,
    creator,
    coverSmall,
    coverMedium,
    nbTracks,
  };
}

export function createDownloadProgress({
  trackId,
  title,
  percent = 0.0,
  status = "idle",
}) {
  return { trackId, title, percent, status };
}

export function createDownloadResult({
  filePath = "",
  requestedQuality = "",
  actualQuality = "",
  status = "pending",
}) {
  return { filePath, requestedQuality, actualQuality, status };
}

export function createFileTagData({
  filePath,
  format,
  title = null,
  artist = null,
  album = null,
  albumArtist = null,
  year = null,
  track = null,
  totalTracks = null,
  disc = null,
  totalDiscs = null,
  genre = null,
  label = null,
  comment = null,
  coverData = null,
  coverMime = null,
}) {
  return {
    filePath,
    format,
    title,
    artist,
    album,
    albumArtist,
    year,
    track,
    totalTracks,
    disc,
    totalDiscs,
    genre,
    label,
    comment,
    coverData,
    coverMime,
  };
}

export function createWriteTagData({
  title = null,
  artist = null,
  album = null,
  albumArtist = null,
  year = null,
  track = null,
  totalTracks = null,
  disc = null,
  totalDiscs = null,
  genre = null,
  label = null,
  comment = null,
  newCoverPath = null,
  removeCover = false,
}) {
  return {
    title,
    artist,
    album,
    albumArtist,
    year,
    track,
    totalTracks,
    disc,
    totalDiscs,
    genre,
    label,
    comment,
    newCoverPath,
    removeCover,
  };
}

// Serialización/deserialización JSON (equivalente a serde)
export { JSON as serialize, JSON as deserialize };

/**
 * Serializa un objeto a JSON string (equivalente a serde_json::to_string)
 * @param {Object} obj
 * @returns {string}
 */
export function toJson(obj) {
  return JSON.stringify(obj);
}

/**
 * Deserializa un JSON string a objeto (equivalente a serde_json::from_str)
 * @template T
 * @param {string} json
 * @returns {T}
 */
export function fromJson(json) {
  return JSON.parse(json);
}
