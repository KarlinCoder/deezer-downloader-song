import express from "express";
import { DeezerClient } from "./deezer/mod.js";
import { downloadTrack } from "./deezer/download.js";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createReadStream } from "node:fs";

const app = express();
const PORT = process.env.PORT || 3000;
const ARL = process.env.DEEZER_ARL;

if (!ARL) {
  console.error("DEEZER_ARL environment variable is required");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "deezer-downloader-api" });
});

let clientPromise;

app.get("/download/:id", async (req, res) => {
  try {
    const trackId = req.params.id;
    const quality = req.query.quality || "MP3_320";

    if (!clientPromise) {
      clientPromise = DeezerClient.create(ARL);
    }
    const client = await clientPromise;

    const result = await downloadTrack({
      client,
      trackId,
      outputDir: tmpdir(),
      quality,
      folderStructure: "flat",
    });

    const filename = result.filePath.split(/[\\/]/).pop();
    const ext = filename.endsWith(".flac") ? "audio/flac" : "audio/mpeg";

    res.set({
      "Content-Type": ext,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });

    const stream = createReadStream(result.filePath);
    stream.pipe(res);

    stream.on("close", () => {
      unlink(result.filePath).catch(() => {});
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/info/:id", async (req, res) => {
  try {
    const trackId = req.params.id;

    if (!clientPromise) {
      clientPromise = DeezerClient.create(ARL);
    }
    const client = await clientPromise;

    const track = await client.getTrack(trackId);
    const trackData = track.DATA || track;

    res.json({
      id: trackData.SNG_ID || trackId,
      title: trackData.SNG_TITLE || "Unknown",
      artist: trackData.ART_NAME || "Unknown",
      album: trackData.ALB_TITLE || "Unknown",
      duration: trackData.DURATION || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Deezer API listening on port ${PORT}`);
});
