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

// Now patch workspace Cargo.toml under [patch.crates-io]
console.log("Checking Cargo.toml at", workspaceCargoTomlPath);
let cargoToml = readFileSync(workspaceCargoTomlPath, "utf-8");

const targetPatch = 'ffmpeg-sys-next = { git = "https://github.com/apoint123/rust-ffmpeg-sys" }';
const localPatch = 'ffmpeg-sys-next = { path = "vendor/rust-ffmpeg-sys-patched" }';

if (cargoToml.includes(targetPatch)) {
	cargoToml = cargoToml.replace(targetPatch, localPatch);
	writeFileSync(workspaceCargoTomlPath, cargoToml, "utf-8");
	console.log("Successfully replaced crates-io patch in Cargo.toml with the local patched path.");
} else if (cargoToml.includes(localPatch)) {
	console.log("Cargo.toml is already patched with the local path.");
} else {
	console.error("ERROR: Could not find the expected [patch.crates-io] entry for ffmpeg-sys-next in Cargo.toml.");
	process.exit(1);
}
