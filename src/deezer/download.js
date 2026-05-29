import {
  createWriteStream,
  mkdirSync,
  existsSync,
  unlink,
  rename,
} from "node:fs";
import { join } from "node:path";
import { finished } from "node:stream/promises";

// Importa las funciones crypto traducidas previamente
import { getBlowfishKey, decryptBlowfishChunk } from "./crypto.js";

// Dependencia necesaria solo para tags MP3 (ligera, ~50KB)
// Instalar: npm install node-id3
import NodeID3 from "node-id3";

const MAX_TRACK_DOWNLOAD_BYTES = 1024 * 1024 * 1024; // 1 GiB safety cap
const IN_PROGRESS_SUFFIX = ".deezy.part";

export const FolderStructure = {
  Flat: "flat",
  ArtistTrack: "artist-track",
  ArtistAlbumTrack: "artist-album-track",
  AlbumTrack: "album-track",
};

export async function downloadTrack({
  client,
  trackId,
  outputDir,
  quality,
  folderStructure = FolderStructure.Flat,
  onProgress,
  onCancelSignal,
}) {
  const track = await client.getTrack(trackId);

  const trackData = track.DATA || track;

  const title = trackData.SNG_TITLE || "Unknown";
  const artist = trackData.ART_NAME || "Unknown";
  const albumTitle = trackData.ALB_TITLE || "Unknown";

  const albumId = extractVal(trackData.ALB_ID);
  const sngId = extractVal(trackData.SNG_ID);

  let fullTitle = title;
  if (trackData.VERSION && trackData.VERSION.trim()) {
    fullTitle = `${fullTitle} ${trackData.VERSION}`.trim();
  }

  emitProgress(onProgress, trackId, fullTitle, 0.0, "resolving");

  const { url, actualQuality } = await client.getTrackDownloadUrl(
    track,
    quality,
    true,
  );

  const ext = getQualityExt(actualQuality);
  const bfKey = getBlowfishKey(sngId);

  // Construir ruta según estructura de carpetas
  const baseDir = outputDir;
  let downloadDir = baseDir;

  switch (folderStructure) {
    case FolderStructure.ArtistTrack:
      downloadDir = join(baseDir, sanitizePathComponent(artist));
      break;
    case FolderStructure.ArtistAlbumTrack:
      downloadDir = join(
        baseDir,
        sanitizePathComponent(artist),
        sanitizePathComponent(albumTitle),
      );
      break;
    case FolderStructure.AlbumTrack:
      downloadDir = join(baseDir, sanitizePathComponent(albumTitle));
      break;
    // Flat: usar baseDir
  }

  mkdirSync(downloadDir, { recursive: true });

  const filename = cleanFilename(`${artist} - ${fullTitle}${ext}`);

  // Manejar nombres duplicados
  let downloadPath = join(downloadDir, filename);
  let counter = 1;
  while (existsSync(downloadPath)) {
    const baseName = cleanFilename(`${artist} - ${fullTitle}`);
    const newFilename = `${baseName} (${counter})${ext}`;
    downloadPath = join(downloadDir, newFilename);
    counter++;

    if (counter > 1000) {
      throw new Error("Too many files with the same name");
    }
  }

  const extNoDot = ext.startsWith(".") ? ext.slice(1) : ext;
  const tempDownloadPath = `${downloadPath}.${extNoDot}${IN_PROGRESS_SUFFIX}`;

  emitProgress(onProgress, trackId, fullTitle, 5.0, "downloading");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }

  const totalSizeHeader = response.headers.get("content-length");
  const totalSizeNum = totalSizeHeader ? parseInt(totalSizeHeader, 10) : 0;

  if (totalSizeNum === 0) {
    throw new Error("Download failed: empty response");
  }
  if (totalSizeNum > MAX_TRACK_DOWNLOAD_BYTES) {
    throw new Error(
      `Download aborted: response too large (${totalSizeNum} bytes)`,
    );
  }

  const reader = response.body.getReader();
  let buffer = Buffer.alloc(0);
  let chunkIndex = 0;
  let downloaded = 0;

  const fileStream = createWriteStream(tempDownloadPath);

  try {
    while (true) {
      if (onCancelSignal?.cancelled) {
        await cleanupTempFile(tempDownloadPath);
        return {
          filePath: "",
          requestedQuality: quality,
          actualQuality,
          status: "canceled",
        };
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer = Buffer.concat([buffer, value]);

      while (buffer.length >= 2048) {
        if (onCancelSignal?.cancelled) {
          await cleanupTempFile(tempDownloadPath);
          return {
            filePath: "",
            requestedQuality: quality,
            actualQuality,
            status: "canceled",
          };
        }

        const chunk = buffer.subarray(0, 2048);
        buffer = buffer.subarray(2048);

        if (downloaded + chunk.length > MAX_TRACK_DOWNLOAD_BYTES) {
          await cleanupTempFile(tempDownloadPath);
          throw new Error("Download aborted: file exceeds allowed size limit");
        }

        let dataToWrite = chunk;
        if (chunkIndex % 3 === 0) {
          dataToWrite = decryptBlowfishChunk(chunk, bfKey);
        }

        fileStream.write(dataToWrite);

        chunkIndex++;
        downloaded += chunk.length;

        if (totalSizeNum > 0) {
          const percent =
            5.0 + Math.min(85.0, (downloaded / totalSizeNum) * 85.0);
          emitProgress(onProgress, trackId, fullTitle, percent, "downloading");
        }
      }
    }

    // Procesar bytes restantes (< 2048) - nunca encriptados
    if (buffer.length > 0) {
      if (onCancelSignal?.cancelled) {
        await cleanupTempFile(tempDownloadPath);
        return {
          filePath: "",
          requestedQuality: quality,
          actualQuality,
          status: "canceled",
        };
      }

      if (downloaded + buffer.length > MAX_TRACK_DOWNLOAD_BYTES) {
        await cleanupTempFile(tempDownloadPath);
        throw new Error("Download aborted: file exceeds allowed size limit");
      }

      fileStream.write(buffer);
    }
  } finally {
    fileStream.end();
    await finished(fileStream);
  }

  emitProgress(onProgress, trackId, fullTitle, 92.0, "tagging");

  // Escribir tags
  let tagError = null;
  try {
    if (ext === ".mp3") {
      await writeMp3Tags(
        tempDownloadPath,
        fullTitle,
        artist,
        albumTitle,
        trackData,
        client,
        albumId,
      );
    } else if (ext === ".flac") {
      await writeFlacTags(
        tempDownloadPath,
        fullTitle,
        artist,
        albumTitle,
        trackData,
        client,
        albumId,
      );
    }
  } catch (e) {
    console.warn(`Warning: failed to write tags: ${e.message}`);
    tagError = e;
    if (onProgress) {
      onProgress({
        type: "tag-writing-error",
        trackId,
        title: fullTitle,
        error: e.message,
      });
    }
  }

  if (onCancelSignal?.cancelled) {
    await cleanupTempFile(tempDownloadPath);
    return {
      filePath: "",
      requestedQuality: quality,
      actualQuality,
      status: "canceled",
    };
  }

  // Renombrar archivo temporal a final
  await renamePromise(tempDownloadPath, downloadPath);

  emitProgress(onProgress, trackId, fullTitle, 100.0, "complete");

  return {
    filePath: downloadPath,
    requestedQuality: quality,
    actualQuality,
    status: tagError ? "complete-with-tag-warning" : "complete",
  };
}

async function writeMp3Tags(
  path,
  title,
  artist,
  album,
  trackData,
  client,
  albumId,
) {
  const tags = {
    title,
    artist,
    album,
  };

  if (trackData.ART_NAME) {
    tags.albumArtist = trackData.ART_NAME;
  }

  if (trackData.PHYSICAL_RELEASE_DATE) {
    const date = trackData.PHYSICAL_RELEASE_DATE;
    if (date.length >= 4) {
      const year = parseInt(date.slice(0, 4), 10);
      if (!isNaN(year)) {
        tags.year = year.toString();
      }
    }
  }

  if (trackData.TRACK_NUMBER) {
    const trackNum = parseU32(trackData.TRACK_NUMBER);
    if (trackNum) tags.trackNumber = trackNum;
  }
  if (trackData.DISK_NUMBER) {
    const diskNum = parseU32(trackData.DISK_NUMBER);
    if (diskNum) tags.discNumber = diskNum;
  }

  // Obtener datos del álbum para portada y tags adicionales
  if (albumId && albumId !== "0") {
    try {
      const albumData = await client.getAlbum(albumId);

      if (albumData.cover_small) {
        const coverId = extractCoverId(albumData.cover_small);
        if (coverId) {
          const coverBytes = await client.getAlbumCover(coverId, 1000);
          tags.image = {
            mime: "image/jpeg",
            type: { id: 3, name: "front cover" },
            description: "Cover",
            imageBuffer: coverBytes,
          };
        }
      }

      if (albumData.genres?.data?.[0]?.name) {
        tags.genre = albumData.genres.data[0].name;
      }

      if (albumData.label) {
        tags.publisher = albumData.label;
      }
    } catch (e) {
      console.warn(
        `Warning: failed to fetch album data for tags: ${e.message}`,
      );
    }
  }

  await NodeID3.write(tags, path);
}

async function writeFlacTags(
  path,
  title,
  artist,
  album,
  trackData,
  client,
  albumId,
) {
  // NOTA: El tagging de FLAC requiere una dependencia adicional.
  // Opción recomendada: npm install music-metadata
  // Si no se instala, se omite el tagging de FLAC sin fallar la descarga.

  try {
    const { writeTags } = await import("music-metadata");

    const tags = {
      TITLE: title,
      ARTIST: artist,
      ALBUM: album,
    };

    if (trackData.ART_NAME) {
      tags.ALBUMARTIST = trackData.ART_NAME;
    }

    if (trackData.PHYSICAL_RELEASE_DATE?.length >= 4) {
      tags.DATE = trackData.PHYSICAL_RELEASE_DATE.slice(0, 4);
    }

    if (trackData.TRACK_NUMBER) {
      const n = parseU32(trackData.TRACK_NUMBER);
      if (n) tags.TRACKNUMBER = n.toString();
    }
    if (trackData.DISK_NUMBER) {
      const n = parseU32(trackData.DISK_NUMBER);
      if (n) tags.DISCNUMBER = n.toString();
    }

    if (albumId && albumId !== "0") {
      try {
        const albumData = await client.getAlbum(albumId);

        if (albumData.cover_small) {
          const coverId = extractCoverId(albumData.cover_small);
          if (coverId) {
            const coverBytes = await client.getAlbumCover(coverId, 1000);
            tags.picture = {
              mime: "image/jpeg",
              type: "Cover (front)",
              description: "Cover",
              data: coverBytes,
            };
          }
        }

        if (albumData.genres?.data?.[0]?.name) {
          tags.GENRE = albumData.genres.data[0].name;
        }

        if (albumData.label) {
          tags.LABEL = albumData.label;
        }
      } catch (e) {
        console.warn(
          `Warning: failed to fetch album data for FLAC tags: ${e.message}`,
        );
      }
    }

    await writeTags(path, { tags });
  } catch {
    // music-metadata no instalado - omitir tagging de FLAC
    console.warn(
      "FLAC tagging skipped: install music-metadata for full support",
    );
  }
}

function emitProgress(onProgress, trackId, title, percent, status) {
  if (onProgress) {
    onProgress({
      type: "download-progress",
      trackId,
      title,
      percent,
      status,
    });
  }
}

function cleanFilename(name) {
  return name
    .split("")
    .filter((c) => c !== "\0")
    .map((c) => ('<>:"/\\|?*'.includes(c) ? "_" : c))
    .join("")
    .trim();
}

function sanitizePathComponent(name) {
  return cleanFilename(name).replace(/^\.+|\.+$/g, "");
}

function extractVal(val) {
  if (typeof val === "string") return val;
  if (typeof val === "number") return val.toString();
  return "";
}

function parseU32(val) {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function cleanupTempFile(path) {
  try {
    await unlink(path);
  } catch {
    // Ignorar errores al limpiar
  }
}

function renamePromise(oldPath, newPath) {
  return new Promise((resolve, reject) => {
    rename(oldPath, newPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getQualityExt(quality) {
  const map = {
    mp3_128: ".mp3",
    mp3_320: ".mp3",
    flac: ".flac",
  };
  return map[quality] || ".mp3";
}

function extractCoverId(url) {
  const match = url.match(/cover\/([^/]+)/);
  return match ? match[1] : null;
}
