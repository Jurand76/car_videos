import fs from "fs";
import { analyzeAudioFile } from "../server/analyzeAudio";

const file = process.argv[2] ?? "public/uploads/1782031107152-suno-sax-instrumental.mp3";

const main = async () => {
  const analysis = await analyzeAudioFile(file);

  fs.writeFileSync(
    "onset-probe.json",
    JSON.stringify(
      {
        analyzer: analysis.analyzer,
        bpm: analysis.bpm,
        beats: analysis.beatTimesSeconds.length,
        accents: analysis.accentPoints.length,
        strongAccents: analysis.accentPoints.filter((point) => point.strength >= 0.55)
          .length,
        topAccents: [...analysis.accentPoints]
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 15),
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
