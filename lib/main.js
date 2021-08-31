#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const docopt = require("docopt");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const run_1 = require("./conf/test/run");
const filesystem_1 = require("./filesystem");
const cli_1 = require("./cli");
const main = (options) => future_1.doFuture(function* () {
    let confs = yield cli_1.readTestSuiteFileDeep(filesystem_1.resolve(options.path));
    yield future_1.sequential(confs.map(conf => run_1.runTestSuite(conf)));
    return future_1.pure(undefined);
});
const BIN = path.basename(__filename);
const defaultCLIOptions = (args) => ({
    path: args['<path>']
});
const cliOptions = defaultCLIOptions(docopt.docopt(`
Usage:
  ${BIN} <path>

The path is a path to a crapaud.json file that tests will be executed from.

Options:
-h--help                  Show this screen.
--version                 Show the version of ${BIN}.
`, { version: require('../package.json').version }));
main(cliOptions).fork(console.error);
//# sourceMappingURL=main.js.map