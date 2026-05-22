import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const patchDir = resolve(scriptDir, "../../../vendor/rust-ffmpeg-sys-patched");
const buildRsPath = resolve(patchDir, "build.rs");
const workspaceCargoTomlPath = resolve(scriptDir, "../../../Cargo.toml");

console.log("Reading build.rs from", buildRsPath);
let content = readFileSync(buildRsPath, "utf-8");

const OLD = `if statik
        && matches!(
            env::var("CARGO_CFG_TARGET_OS").as_deref(),
            Ok("macos") | Ok("ios")
        )
    {
        let frameworks = vec![
            "AppKit",
            "AudioToolbox",
            "AVFoundation",
            "CoreFoundation",
            "CoreGraphics",
            "CoreMedia",
            "CoreServices",
            "CoreVideo",
            "Foundation",
            "OpenCL",
            "OpenGL",
            "QTKit",
            "QuartzCore",
            "Security",
            "VideoDecodeAcceleration",
            "VideoToolbox",
        ];
        for f in frameworks {
            println!("cargo:rustc-link-lib=framework={f}");
        }
    }`;

const NEW = `if statik && env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // macOS-only: includes AppKit, QTKit, OpenGL, OpenCL, VideoDecodeAcceleration
        let frameworks = vec![
            "AppKit",
            "AudioToolbox",
            "AVFoundation",
            "CoreFoundation",
            "CoreGraphics",
            "CoreMedia",
            "CoreServices",
            "CoreVideo",
            "Foundation",
            "OpenCL",
            "OpenGL",
            "QTKit",
            "QuartzCore",
            "Security",
            "VideoDecodeAcceleration",
            "VideoToolbox",
        ];
        for f in frameworks {
            println!("cargo:rustc-link-lib=framework={f}");
        }
    } else if statik && env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        // iOS-only: AppKit, QTKit, OpenGL, OpenCL, VideoDecodeAcceleration do NOT exist in iOS SDK
        let frameworks = vec![
            "AudioToolbox",
            "AVFoundation",
            "CoreFoundation",
            "CoreGraphics",
            "CoreMedia",
            "CoreServices",
            "CoreVideo",
            "Foundation",
            "QuartzCore",
            "Security",
            "VideoToolbox",
        ];
        for f in frameworks {
            println!("cargo:rustc-link-lib=framework={f}");
        }
    }`;

if (!content.includes("Ok(\"macos\") | Ok(\"ios\")")) {
	console.error("ERROR: Expected patch target not found in build.rs.");
	process.exit(1);
}

const patched = content.replace(OLD, NEW);
if (patched === content) {
	console.error("ERROR: Patch replacement failed to apply.");
	process.exit(1);
}

writeFileSync(buildRsPath, patched, "utf-8");
console.log("Successfully patched build.rs");

// Now append the patch to workspace Cargo.toml
console.log("Checking Cargo.toml at", workspaceCargoTomlPath);
let cargoToml = readFileSync(workspaceCargoTomlPath, "utf-8");
const patchBlock = `
# --- iOS CI patch: override ffmpeg-sys-next with a locally patched version ---
[patch."https://github.com/apoint123/rust-ffmpeg-sys"]
ffmpeg-sys-next = { path = "vendor/rust-ffmpeg-sys-patched" }
`;

if (!cargoToml.includes("vendor/rust-ffmpeg-sys-patched")) {
	cargoToml = cargoToml.trimEnd() + "\n" + patchBlock;
	writeFileSync(workspaceCargoTomlPath, cargoToml, "utf-8");
	console.log("Successfully appended [patch] block to workspace Cargo.toml");
} else {
	console.log("[patch] block already exists in Cargo.toml");
}
