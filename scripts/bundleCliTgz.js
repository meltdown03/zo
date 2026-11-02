/**
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright Contributors to the Zowe Project.
 *
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const outDir = path.resolve(process.argv[2]);
process.chdir(__dirname + "/..");
fs.mkdirSync(outDir, { recursive: true });

const SDK_NAME = "@zowe/zowex-for-zowe-sdk";
const sdkVersion = JSON.parse(fs.readFileSync(path.join("packages", "sdk", "package.json"), "utf8")).version;
const sdkTarball = path.join(outDir, `zowe-zowex-for-zowe-sdk-${sdkVersion}.tgz`);
if (!fs.existsSync(sdkTarball)) {
    throw new Error(`Missing ${sdkTarball}. Package the SDK before the CLI.`);
}

const tempDir = fs.mkdtempSync("build-");

try {
    const execOptions = { cwd: tempDir, stdio: "inherit" };
    fs.cpSync(path.join("packages", "cli"), tempDir, { recursive: true });
    const shrinkwrapPath = path.join(tempDir, "npm-shrinkwrap.json");
    fs.copyFileSync("package-lock.json", shrinkwrapPath);

    // 1.1.0 is not on the registry. Install the tarball already packed into dist.
    const tempPkgPath = path.join(tempDir, "package.json");
    const originalPkg = fs.readFileSync(tempPkgPath);
    const tempPkg = JSON.parse(originalPkg);
    tempPkg.dependencies[SDK_NAME] = `file:${sdkTarball}`;
    fs.writeFileSync(tempPkgPath, `${JSON.stringify(tempPkg, null, 2)}\n`);

    const shrinkwrap = JSON.parse(fs.readFileSync(shrinkwrapPath, "utf8"));
    const sdkMeta = shrinkwrap.packages["packages/sdk"];
    shrinkwrap.packages[`node_modules/${SDK_NAME}`] = {
        version: sdkVersion,
        resolved: `file:${sdkTarball}`,
        license: sdkMeta.license,
        dependencies: sdkMeta.dependencies,
        optionalDependencies: sdkMeta.optionalDependencies,
        peerDependencies: sdkMeta.peerDependencies,
    };
    shrinkwrap.packages["packages/cli"].dependencies[SDK_NAME] = `file:${sdkTarball}`;
    fs.writeFileSync(shrinkwrapPath, `${JSON.stringify(shrinkwrap)}\n`);

    execSync("npm install --ignore-scripts", execOptions);

    // The published manifest should depend on the version, not this machine's dist path.
    fs.writeFileSync(tempPkgPath, originalPkg);
    fs.copyFileSync("package-lock.json", shrinkwrapPath);
    fs.rmSync(path.join(tempDir, "node_modules", "cpu-features"), { recursive: true, force: true });
    fs.rmSync(path.join(tempDir, "node_modules", "russh"), { recursive: true, force: true });
    execSync(`npm pack --pack-destination="${outDir}"`, execOptions);
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
