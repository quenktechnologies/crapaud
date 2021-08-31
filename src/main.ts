#! /usr/bin/env node

import * as path from 'path';
import * as docopt from 'docopt';

import { execFile as _execFile } from 'child_process';

import {
    doFuture,
    sequential,
    pure,
} from '@quenk/noni/lib/control/monad/future';
import {
    Path,
} from '@quenk/noni/lib/io/file';
import { Object } from '@quenk/noni/lib/data/json';

import { TestSuiteConf } from './conf/test/suite';
import { runTestSuite } from './conf/test/run';
import { resolve } from './filesystem';
import { readTestSuiteFileDeep } from './cli';

/**
 * CLIOptions received from the terminal.
 */
interface CLIOptions {

    /**
     * path to the test suite config file.
     */
    path: Path

}

const main = (options: CLIOptions) => doFuture(function*() {

    let confs: TestSuiteConf[] =
        yield readTestSuiteFileDeep(resolve(options.path));

    yield sequential(confs.map(conf => runTestSuite(conf)));

    return pure(<void>undefined);

});

const BIN = path.basename(__filename);

const defaultCLIOptions = (args: Object): CLIOptions => ({

    path: <string>args['<path>']

});

const cliOptions: CLIOptions = defaultCLIOptions(docopt.docopt(`
Usage:
  ${BIN} <path>

The path is a path to a crapaud.json file that tests will be executed from.

Options:
-h--help                  Show this screen.
--version                 Show the version of ${BIN}.
`, { version: require('../package.json').version }));

main(cliOptions).fork(console.error);
