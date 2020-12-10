import * as path from 'path';

import { runTests } from 'vscode-test';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './index.js');

    const vscodeVersion = "1.39.0";
    console.log({ extensionDevelopmentPath, extensionTestsPath })
    // Download VS Code, unzip it and run the integration test
    await runTests({ extensionDevelopmentPath, extensionTestsPath, version: vscodeVersion });
  } catch (err) {
    console.log('error')
    console.error({err});
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();