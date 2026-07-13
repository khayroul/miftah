import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const buildRoot = path.resolve(".next");
const routeManifestPath = path.join(
  buildRoot,
  "server/app/read/[page]/page_client-reference-manifest.js",
);
const routeKey = "/read/[page]/page";
const entryPattern = /features\/read\/components\/(ReadPageWorkspace|ReadAudioProvider)\.tsx$/;
const forbiddenMarkers = ["onnxruntime", "MicVAD", "ricky0123", "TasmiRecorder"];

if (!fs.existsSync(routeManifestPath)) {
  throw new Error("Read client-reference manifest is missing. Run a production build first.");
}

const sandbox = { globalThis: { __RSC_MANIFEST: {} } };
vm.runInNewContext(fs.readFileSync(routeManifestPath, "utf8"), sandbox);
const manifest = sandbox.globalThis.__RSC_MANIFEST[routeKey];
if (!manifest) throw new Error(`Missing RSC manifest entry: ${routeKey}`);

const clientEntries = Object.entries(manifest.clientModules).filter(([modulePath]) =>
  entryPattern.test(modulePath),
);
if (clientEntries.length === 0) throw new Error("Read client entries were not found.");

const chunkPaths = [...new Set(
  clientEntries.flatMap(([, entry]) =>
    entry.chunks.filter((chunk) => typeof chunk === "string" && chunk.endsWith(".js")),
  ),
)];

let rawBytes = 0;
let gzipBytes = 0;
const violations = [];
for (const chunkPath of chunkPaths) {
  const absolutePath = path.join(buildRoot, decodeURIComponent(chunkPath));
  const source = fs.readFileSync(absolutePath);
  const gzipSize = zlib.gzipSync(source).length;
  const markers = forbiddenMarkers.filter((marker) => source.includes(marker));
  rawBytes += source.length;
  gzipBytes += gzipSize;
  if (markers.length > 0) violations.push({ chunkPath, markers });
}

console.log(
  `Read initial chunks: ${chunkPaths.length} files, ${rawBytes} raw bytes, ${gzipBytes} gzip bytes`,
);
if (violations.length > 0) {
  throw new Error(`Heavy voice runtime leaked into Read initial chunks: ${JSON.stringify(violations)}`);
}
console.log("Read initial chunks exclude ONNX, MicVAD, VAD-web, and TasmiRecorder.");
